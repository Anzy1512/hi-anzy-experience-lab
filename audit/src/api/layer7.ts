import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { getDriver } from '../db/client.ts';
import { metricsFor, metricsForPilot, runIdsForPilot } from '../metrics/run.ts';
import { validateLiveModel } from '../model/validate.ts';
import { createPlaceProvider } from '../places/nominatim.ts';
import { createPilot, executePilot } from '../pilot/run.ts';
import { PilotSpecSchema } from '../pilot/spec.ts';
import { exportCorpus, pendingReviews, reviewMetrics, submitReview } from '../review/feedback.ts';

/**
 * LAYER 7'S ADDITIONS TO THE PRODUCT API.
 *
 * ── A SEPARATE FILE, AND WHY ────────────────────────────────────────────────
 *
 * `routes.ts` is the product surface layer 6 shipped and it is complete: three
 * shapes of request, every one returning evidence beside its conclusions. What
 * layer 7 adds is a different kind of thing — how a run was configured, how
 * well it did, and what a person thought of it — and folding eleven routes into
 * that file would bury the shape it was written to make obvious.
 *
 * Registered as a plugin beside the first, so both are one API to a caller and
 * two files to a reader.
 *
 * ── THE ONE ROUTE THAT SPENDS MONEY IS A POST ───────────────────────────────
 *
 * `/v1/model/validate` calls a paid provider. A GET that costs money is a trap:
 * it will be retried by a proxy, prefetched by a browser, or hit by a health
 * check, and every one of those is a charge nobody authorised. So it is a POST,
 * it takes explicit ceilings, and the ceilings default low.
 *
 * ── AND REVIEWS ARE WRITES THAT NEVER OVERWRITE ─────────────────────────────
 *
 * `POST /v1/reviews` only ever inserts. There is no route to edit a finding and
 * none to edit a review, because the value of this table is that it records
 * what was said at the time — including by someone who turned out to be wrong.
 */

function parse<T extends z.ZodTypeAny>(
  schema: T,
  value: unknown,
): { ok: true; data: z.infer<T> } | { ok: false; detail: string } {
  const r = schema.safeParse(value);
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, detail: r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ') };
}

const Uuid = z.object({ id: z.string().uuid() });

export async function layer7Routes(app: FastifyInstance): Promise<void> {
  /* ---- pilots ------------------------------------------------------------ */

  app.post('/v1/pilots', async (req, reply) => {
    const parsed = parse(PilotSpecSchema, req.body);
    if (!parsed.ok) return reply.code(400).send({ error: 'invalid pilot specification', detail: parsed.detail });

    const d = await getDriver();
    const place = createPlaceProvider();
    const availability = await place.available();
    const pilotId = await createPilot(d, parsed.data);

    /*
     * Created either way, and told plainly what it will be able to do.
     *
     * A pilot with no geographic provider and no seeds cannot find anybody, and
     * refusing it here would hide that behind a 400 about configuration. Created
     * with a warning, it runs, reports BLOCKED, and the reason is in the record
     * where an operator can see it next to the spec that produced it.
     */
    return reply.code(201).send({
      pilotId,
      run: `/v1/pilots/${pilotId}/run`,
      geography: { provider: place.id, ...availability },
      willDiscover: availability.ok || parsed.data.seeds.length > 0,
      note:
        availability.ok || parsed.data.seeds.length > 0
          ? null
          : 'No geographic provider is configured and no seed URLs were supplied, so this pilot has nothing to look at.',
    });
  });

  app.post('/v1/pilots/:id/run', async (req, reply) => {
    const p = parse(Uuid, req.params);
    if (!p.ok) return reply.code(400).send({ error: 'invalid pilot id', detail: p.detail });
    const body = parse(z.object({ background: z.boolean().default(true) }), req.body ?? {});
    const d = await getDriver();

    const exists = await d.query<{ id: string }>('select id from pilot where id = $1', [p.data.id]);
    if (exists[0] === undefined) return reply.code(404).send({ error: 'no such pilot' });

    if (body.ok && body.data.background === false) {
      const result = await executePilot(d, p.data.id);
      return reply.send(result);
    }

    /* Started, not awaited. Every intermediate state is a row, so a client that
       disconnects loses nothing; the catch keeps a thrown pilot from taking the
       process with it and leaving the row looking merely slow. */
    void executePilot(d, p.data.id).catch(async (err: unknown) => {
      await d
        .query(`update pilot set state = 'FAILED', detail = $2, finished_at = now() where id = $1`, [
          p.data.id,
          err instanceof Error ? err.message : String(err),
        ])
        .catch(() => undefined);
    });
    return reply.code(202).send({ pilotId: p.data.id, state: 'RUNNING', poll: `/v1/pilots/${p.data.id}` });
  });

  app.get('/v1/pilots', async (req, reply) => {
    const q = parse(
      z.object({
        projectId: z.string().max(80).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(25),
      }),
      req.query,
    );
    if (!q.ok) return reply.code(400).send({ error: 'invalid query', detail: q.detail });
    const d = await getDriver();
    const rows = await d.query<Record<string, unknown>>(
      `select p.id, p.name, p.state, p.detail, p.project_id, p.job_id, p.place_provider,
              p.created_at, p.started_at, p.finished_at,
              p.spec -> 'area' as area,
              p.spec -> 'categories' as categories,
              (select count(*) from place_observation o where o.pilot_id = p.id)::text as candidates,
              (select count(*) from place_observation o where o.pilot_id = p.id and o.use = 'SUBJECT')::text as subjects
         from pilot p
        where ($1::text is null or p.project_id = $1)
        order by p.created_at desc limit $2`,
      [q.data.projectId ?? null, q.data.limit],
    );
    return reply.send({ pilots: rows });
  });

  app.get('/v1/pilots/:id', async (req, reply) => {
    const p = parse(Uuid, req.params);
    if (!p.ok) return reply.code(400).send({ error: 'invalid pilot id', detail: p.detail });
    const d = await getDriver();

    const rows = await d.query<Record<string, unknown>>(
      `select id, name, spec, state, detail, project_id, job_id, place_provider, created_at, started_at, finished_at
         from pilot where id = $1`,
      [p.data.id],
    );
    const pilot = rows[0];
    if (pilot === undefined) return reply.code(404).send({ error: 'no such pilot' });

    /*
     * Every candidate, including the rejected ones, and the reason.
     *
     * This is the coverage answer. A pilot that returned only its subjects
     * would let a reader conclude that three breweries exist in Leeds, when what
     * happened is that sixteen were found and thirteen had no website recorded,
     * sat outside the radius, or were beyond the subject cap.
     */
    const candidates = await d.query<Record<string, unknown>>(
      `select o.use, o.name, o.category, o.latitude, o.longitude, o.precision, o.distance_km,
              o.website_candidate, o.address, o.external_id, o.provider, o.entity_id,
              e.canonical_name as resolved_name
         from place_observation o
         left join entity e on e.id = o.entity_id
        where o.pilot_id = $1
        order by o.use, o.distance_km nulls last`,
      [p.data.id],
    );

    return reply.send({
      pilot,
      candidates,
      runIds: await runIdsForPilot(d, p.data.id),
      note: 'Every candidate a provider returned is here, with the reason it was or was not researched.',
    });
  });

  app.get('/v1/pilots/:id/metrics', async (req, reply) => {
    const p = parse(Uuid, req.params);
    if (!p.ok) return reply.code(400).send({ error: 'invalid pilot id', detail: p.detail });
    const d = await getDriver();
    const exists = await d.query<{ id: string }>('select id from pilot where id = $1', [p.data.id]);
    if (exists[0] === undefined) return reply.code(404).send({ error: 'no such pilot' });
    return reply.send(await metricsForPilot(d, p.data.id));
  });

  /* ---- metrics ----------------------------------------------------------- */

  app.get('/v1/metrics', async (req, reply) => {
    const q = parse(z.object({ jobId: z.string().uuid().optional() }), req.query);
    if (!q.ok) return reply.code(400).send({ error: 'invalid query', detail: q.detail });
    const d = await getDriver();

    if (q.data.jobId !== undefined) {
      const runs = await d.query<{ audit_run_id: string | null }>(
        'select audit_run_id from task where job_id = $1 and audit_run_id is not null',
        [q.data.jobId],
      );
      const runIds = runs.map((r) => r.audit_run_id).filter((id): id is string => id !== null);
      return reply.send({ scope: { jobId: q.data.jobId, runs: runIds.length }, ...(await metricsFor(d, { runIds })) });
    }
    return reply.send({ scope: { jobId: null, runs: null }, ...(await metricsFor(d)) });
  });

  /* ---- human review ------------------------------------------------------ */

  app.get('/v1/reviews/pending', async (req, reply) => {
    const q = parse(
      z.object({
        limit: z.coerce.number().int().min(1).max(200).default(25),
        includeReviewed: z.coerce.boolean().default(false),
        entityId: z.string().uuid().optional(),
      }),
      req.query,
    );
    if (!q.ok) return reply.code(400).send({ error: 'invalid query', detail: q.detail });
    const d = await getDriver();
    const findings = await pendingReviews(d, {
      limit: q.data.limit,
      includeReviewed: q.data.includeReviewed,
      ...(q.data.entityId !== undefined ? { entityId: q.data.entityId } : {}),
    });
    return reply.send({
      findings,
      vocabulary: {
        verdict: ['SUPPORTED', 'PARTIALLY_SUPPORTED', 'UNSUPPORTED', 'INCORRECT', 'STALE', 'AMBIGUOUS'],
        retrievalQuality: ['GOOD', 'PARTIAL', 'POOR'],
        citationValidity: ['VALID', 'PARTIAL', 'INVALID', 'NO_CITATION'],
        entityResolution: ['CORRECT', 'FALSE_MERGE', 'MISSED_MERGE', 'CORRECTLY_AMBIGUOUS', 'NOT_APPLICABLE'],
        recommendationQuality: ['ACTIONABLE', 'GENERIC', 'WRONG', 'NOT_APPLICABLE'],
      },
      /* Said to the reviewer, because the distinction is the point of the table. */
      readThisFirst: [
        'UNSUPPORTED means the cited passage does not say it. INCORRECT means it is not true. A finding can be either without being the other.',
        'STALE means it was true and the page has moved on. Nothing in the pipeline is broken in that case.',
        'CORRECTLY_AMBIGUOUS is a pass, not a miss: refusing to merge two records that cannot be told apart is the resolver working.',
        'Your review is added. The finding is never edited, because the pair is what a later evaluation reads.',
      ],
    });
  });

  app.post('/v1/reviews', async (req, reply) => {
    const d = await getDriver();
    try {
      const { id } = await submitReview(d, req.body);
      return reply.code(201).send({ reviewId: id });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      /* A missing finding is the caller's mistake, not a server fault. */
      const missing = detail.startsWith('no finding ');
      return reply.code(missing ? 404 : 400).send({ error: missing ? 'no such finding' : 'invalid review', detail });
    }
  });

  app.get('/v1/reviews/metrics', async (_req, reply) => {
    const d = await getDriver();
    const m = await reviewMetrics(d);
    return reply.send({
      ...m,
      note:
        m.reviews === 0
          ? 'No finding has been reviewed by a person yet, so nothing here can be measured against a human judgement.'
          : 'Agreement counts only. No precision or recall is reported, because the denominator would be the set of findings the system itself chose.',
    });
  });

  app.get('/v1/corpus', async (req, reply) => {
    const q = parse(z.object({ limit: z.coerce.number().int().min(1).max(1000).default(200) }), req.query);
    if (!q.ok) return reply.code(400).send({ error: 'invalid query', detail: q.detail });
    const d = await getDriver();
    const examples = await exportCorpus(d, { limit: q.data.limit });
    return reply.send({
      format: 'hi-anzy-audit/corpus@1',
      exportedAt: new Date().toISOString(),
      examples,
      count: examples.length,
      readThisFirst: [
        'Each example carries the question, the evidence kept AND the evidence rejected, the finding, the automated verification and the human verdict.',
        'The version fields are a snapshot taken when the review was written. A label does not describe later code.',
        'This is an evaluation corpus. Nothing has been fine-tuned on it and no model has been trained.',
      ],
    });
  });

  /* ---- live model validation --------------------------------------------- */

  app.post('/v1/model/validate', async (req, reply) => {
    const body = parse(
      z.object({
        maxTokens: z.number().int().min(50).max(2000).default(400),
        maxCostMicros: z.number().int().min(0).max(1_000_000).default(50_000),
      }),
      req.body ?? {},
    );
    if (!body.ok) return reply.code(400).send({ error: 'invalid ceilings', detail: body.detail });
    const d = await getDriver();
    const result = await validateLiveModel(d, body.data);
    /*
     * 200 for BLOCKED as well. Nothing failed: a provider is not configured,
     * which is a supported state of this service and an answer to the question
     * that was asked.
     */
    return reply.send(result);
  });
}
