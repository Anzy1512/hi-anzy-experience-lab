import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { config } from '../config.ts';
import { getDriver } from '../db/client.ts';
import { ProviderRegistry } from '../search/providers.ts';
import { createProvider, providerSummary } from '../model/route.ts';
import { answer } from '../intel/engine.ts';
import { IntelligenceRequestSchema } from '../intel/contract.ts';
import { createJob, loadTasks, runIdsIn, runJob } from '../jobs/orchestrator.ts';
import * as Q from '../entity/query.ts';
import { createPlaceProvider } from '../places/nominatim.ts';

/**
 * THE PRODUCT API.
 *
 * ── WHAT A CALLER CAN ASK FOR, AND WHAT COMES BACK ──────────────────────────
 *
 * Three shapes of request, which is the whole surface:
 *
 *   /v1/answer      one question, answered now, deterministically where it can be
 *   /v1/jobs        research that takes a while, with progress and resume
 *   /v1/entities    the graph itself, and the evidence under every value
 *
 * ── EVERY ANSWER CARRIES ITS OWN LIMITS ─────────────────────────────────────
 *
 * There is no endpoint that returns conclusions without the evidence beside
 * them and the limitations after them. That is not politeness: a consumer of
 * this API is going to put these sentences in front of somebody who will act
 * on them, and "no storefront was observed in the sources checked" and "has no
 * storefront" lead to different decisions. The first is what this service can
 * establish, so the first is what it returns, every time.
 *
 * ── AND WHAT THIS DEPLOYMENT CANNOT DO IS A ROUTE ───────────────────────────
 *
 * `/v1/capabilities` states whether a model is configured, whether discovery
 * is configured, and which providers answer right now. A client should not
 * have to discover by 404 or by silence that no search provider exists — the
 * Lab's own habit of naming what is missing applies to its backend.
 */

const Uuid = z.object({ id: z.string().uuid() });

/** Parse, or hand the caller the reason in words rather than a 500. */
function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): { ok: true; data: z.infer<T> } | { ok: false; detail: string } {
  const r = schema.safeParse(value);
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, detail: r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ') };
}

export async function productRoutes(app: FastifyInstance): Promise<void> {
  /* ---- what this deployment can actually do ------------------------------ */
  app.get('/v1/capabilities', async () => {
    const model = createProvider();
    return {
      corpus: true,
      retrieval: true,
      entities: true,
      /* Layer 4 and 5 are built, so these are true — and they say what the
         deployment can do, not what the codebase contains. */
      synthesis: true,
      jobs: true,
      model: { available: model.available, detail: providerSummary(model) },
      search: {
        configured: config.SEARCH_PROVIDER !== 'none',
        providers: await ProviderRegistry.fromConfig().report(),
      },
      /*
       * Geography, stated rather than implied by an empty map.
       *
       * With no provider, a business is placed only when its own pages publish
       * coordinates — which most do not — so a client showing a map needs to
       * know whether a thin plate means a thin dataset or an absent geocoder.
       */
      geography: await (async () => {
        const place = createPlaceProvider();
        const a = await place.available();
        return { provider: place.id, ...a };
      })(),
      /*
       * Whether a live model has EVER answered in this deployment, which is not
       * the same question as whether one is configured.
       */
      liveModel: await (async () => {
        const d = await getDriver();
        const rows = await d.query<{ n: string; last: string | null }>(
          'select count(*)::text as n, max(called_at)::text as last from live_model_call where ok = 1',
        );
        return { calls: Number(rows[0]?.n ?? 0), lastAt: rows[0]?.last ?? null };
      })(),
      pilots: true,
      humanReview: true,
      /* True with or without discovery, and the reason this service is useful
         to somebody who has URLs and no search account. */
      directIngestion: true,
    };
  });

  /* ---- one question, answered now ---------------------------------------- */
  app.post('/v1/answer', async (req, reply) => {
    const parsed = parse(IntelligenceRequestSchema, req.body);
    if (!parsed.ok) return reply.code(400).send({ error: 'invalid request', detail: parsed.detail });

    const d = await getDriver();
    const res = await answer(d, parsed.data);
    return reply.send({
      runId: res.runId,
      question: res.question,
      intent: res.intent,
      termination: res.termination,
      summary: res.summary,
      summarySource: res.summarySource,
      findings: {
        established: res.established.map(presentFinding),
        gaps: res.gaps.map(presentFinding),
        conflicts: res.conflicts.map(presentFinding),
        recommendations: res.recommendations.map(presentFinding),
        /* Counted, never returned as prose. A consumer can see how much was
           refused without being able to render it by accident. */
        withheldCount: res.withheld.length,
      },
      evidence: res.evidence,
      coverage: res.coverage,
      cost: { ...res.cost, costMicros: res.cost.costMicros < 0 ? null : res.cost.costMicros },
      limitations: res.limitations,
      plan: res.plan,
    });
  });

  /* ---- research that takes a while --------------------------------------- */
  app.post('/v1/jobs', async (req, reply) => {
    const body = z.object({ background: z.boolean().default(true) }).passthrough().safeParse(req.body ?? {});
    const parsed = parse(IntelligenceRequestSchema, req.body);
    if (!parsed.ok) return reply.code(400).send({ error: 'invalid request', detail: parsed.detail });

    const d = await getDriver();
    const { jobId, problems } = await createJob(d, parsed.data);
    if (problems.length > 0) {
      /*
       * 422, not 400. The request was well-formed; what it asked for cannot be
       * turned into research — an ambiguous question, most often. The
       * distinction matters to a client deciding whether to fix its code or
       * ask its user.
       */
      return reply.code(422).send({ jobId, error: 'this question cannot be researched as asked', problems });
    }

    const background = body.success ? body.data.background !== false : true;
    if (!background) {
      const result = await runJob(d, jobId);
      return reply.code(200).send(presentJobResult(result));
    }

    /*
     * Started, not awaited. Everything the job needs is in the database, so a
     * client that disconnects loses nothing and the run can be resumed; the
     * catch exists because an unhandled rejection here would take the process
     * with it and leave the job looking merely slow.
     */
    void runJob(d, jobId).catch(async (err: unknown) => {
      await d
        .query(`update job set state = 'FAILED', termination = 'FAILED', error = $2, finished_at = now() where id = $1`, [
          jobId,
          err instanceof Error ? err.message : String(err),
        ])
        .catch(() => undefined);
    });
    return reply.code(202).send({ jobId, state: 'RUNNING', poll: `/v1/jobs/${jobId}` });
  });

  app.post('/v1/jobs/:id/run', async (req, reply) => {
    const p = parse(Uuid, req.params);
    if (!p.ok) return reply.code(400).send({ error: 'invalid job id', detail: p.detail });
    const d = await getDriver();
    /* Idempotent by construction: finished tasks are not redone, so calling
       this on a complete job returns what it already produced. */
    const result = await runJob(d, p.data.id);
    return reply.send(presentJobResult(result));
  });

  app.get('/v1/jobs', async (req, reply) => {
    const q = z.object({ projectId: z.string().max(80).optional(), limit: z.coerce.number().int().min(1).max(100).default(25) });
    const parsed = parse(q, req.query);
    if (!parsed.ok) return reply.code(400).send({ error: 'invalid query', detail: parsed.detail });

    const d = await getDriver();
    const rows = await d.query<Record<string, unknown>>(
      `select id, question, intent, state, termination, project_id, model_calls, tool_calls,
              pages_crawled, searches, tokens_in, tokens_out, cost_micros, created_at, finished_at
         from job
        where ($1::text is null or project_id = $1)
        order by created_at desc limit $2`,
      [parsed.data.projectId ?? null, parsed.data.limit],
    );
    return reply.send({ jobs: rows });
  });

  app.get('/v1/jobs/:id', async (req, reply) => {
    const p = parse(Uuid, req.params);
    if (!p.ok) return reply.code(400).send({ error: 'invalid job id', detail: p.detail });

    const d = await getDriver();
    const rows = await d.query<Record<string, unknown>>(
      `select id, question, intent, state, termination, project_id, subject_entity_id,
              model_calls, tool_calls, tokens_in, tokens_out, cost_micros, searches,
              pages_crawled, iterations, limitations, error, created_at, started_at, finished_at
         from job where id = $1`,
      [p.data.id],
    );
    const job = rows[0];
    if (job === undefined) return reply.code(404).send({ error: 'no such job' });

    const tasks = await loadTasks(d, p.data.id);
    return reply.send({
      job,
      /* Progress as counts AND as the graph, because a bar tells you how far
         and the graph tells you what is actually happening. */
      progress: {
        total: tasks.length,
        done: tasks.filter((t) => t.state === 'DONE').length,
        failed: tasks.filter((t) => t.state === 'FAILED').length,
        skipped: tasks.filter((t) => t.state === 'SKIPPED').length,
        pending: tasks.filter((t) => t.state === 'PENDING').length,
      },
      tasks: tasks.map((t) => ({
        key: t.key,
        kind: t.kind,
        agent: t.agent,
        state: t.state,
        dependsOn: t.dependsOn,
        rationale: t.rationale,
        attempts: t.attempts,
        error: t.error,
      })),
    });
  });

  /** Everything the agents did, in order. This is the progress view's source. */
  app.get('/v1/jobs/:id/trace', async (req, reply) => {
    const p = parse(Uuid, req.params);
    if (!p.ok) return reply.code(400).send({ error: 'invalid job id', detail: p.detail });
    const d = await getDriver();

    const steps = await d.query<Record<string, unknown>>(
      `select t.key as task, s.agent, s.turn, s.purpose, s.note,
              s.new_observations, s.new_entities, s.new_findings, s.created_at
         from agent_step s join task t on t.id = s.task_id
        where t.job_id = $1 order by s.created_at`,
      [p.data.id],
    );
    const calls = await d.query<Record<string, unknown>>(
      `select t.key as task, c.agent, c.tool, c.args, c.outcome, c.result, c.duration_ms,
              c.pages_crawled, c.searches, c.created_at
         from tool_call c join task t on t.id = c.task_id
        where t.job_id = $1 order by c.created_at`,
      [p.data.id],
    );
    return reply.send({ steps, toolCalls: calls });
  });

  /** The findings, each with the citations under it. The evidence view. */
  app.get('/v1/jobs/:id/findings', async (req, reply) => {
    const p = parse(Uuid, req.params);
    if (!p.ok) return reply.code(400).send({ error: 'invalid job id', detail: p.detail });
    const d = await getDriver();

    const runIds = await runIdsForJob(d, p.data.id);
    if (runIds.length === 0) return reply.send({ findings: [], withheldCount: 0 });

    const rows = await d.query<Record<string, unknown>>(
      /* The name travels with the finding. Five identical recommendations with
         no indication of which business each is about is not a report. */
      `select f.id, f.statement, f.status, f.finding_type, f.reasoning_type, f.rule_id,
              f.limitations, f.verification, f.verification_reason, f.entity_id, f.area,
              e.canonical_name as entity_name
         from finding f
         left join entity e on e.id = f.entity_id
        where f.audit_run_id = any($1::uuid[])
        order by f.ord`,
      [runIds],
    );

    const out: Array<Record<string, unknown>> = [];
    for (const f of rows) {
      const citations = await d.query<Record<string, unknown>>(
        'select quote, url, retrieved_at, chunk_id, observation_id, claim_id from finding_citation where finding_id = $1',
        [f.id as string],
      );
      out.push({ ...f, citations });
    }
    /* Rejected statements are returned as a COUNT and never as text. They are
       kept so the failure rate stays countable, not so a client can render
       them by accident. */
    return reply.send({
      findings: out.filter((f) => f.verification !== 'REJECTED' && f.status !== 'UNSUPPORTED'),
      withheldCount: out.filter((f) => f.verification === 'REJECTED' || f.status === 'UNSUPPORTED').length,
    });
  });

  /* ---- the graph ---------------------------------------------------------- */
  app.get('/v1/entities', async (req, reply) => {
    const q = z.object({
      type: z.string().max(40).optional(),
      domain: z.string().max(253).optional(),
      category: z.string().max(60).optional(),
      has: z.string().max(200).optional(),
      lacks: z.string().max(200).optional(),
      /* The headline question of this product is "businesses in this area with
         this gap". Two calls and an intersection in the client is not that. */
      lat: z.coerce.number().min(-90).max(90).optional(),
      lon: z.coerce.number().min(-180).max(180).optional(),
      radiusKm: z.coerce.number().positive().max(500).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    });
    const parsed = parse(q, req.query);
    if (!parsed.ok) return reply.code(400).send({ error: 'invalid query', detail: parsed.detail });
    const a = parsed.data;
    const d = await getDriver();

    /*
     * The geography narrows the set BEFORE the capability filter.
     *
     * `findWithCapability` runs two queries per entity per capability, so
     * handing it every business in the store and discarding the distant ones
     * afterwards does the expensive part for rows that were never candidates.
     */
    const inArea =
      a.lat !== undefined && a.lon !== undefined
        ? new Set((await Q.findNearby(d, a.lat, a.lon, a.radiusKm ?? 10)).map((e) => e.id))
        : null;

    if (a.has !== undefined || a.lacks !== undefined) {
      const rows = await Q.findWithCapability(d, {
        ...(a.has !== undefined ? { has: a.has.split(',').map((s) => s.trim()).filter(Boolean) } : {}),
        ...(a.lacks !== undefined ? { lacks: a.lacks.split(',').map((s) => s.trim()).filter(Boolean) } : {}),
        ...(a.type !== undefined ? { type: a.type } : {}),
        limit: a.limit,
      });
      return reply.send({
        entities: inArea === null ? rows : rows.filter((e) => inArea.has(e.id)),
        ...(inArea === null
          ? {}
          : {
              /* Stated, because a business with no published coordinate cannot
                 be inside or outside a radius — it is simply not on the map. */
              geography: {
                centre: { lat: a.lat, lon: a.lon },
                radiusKm: a.radiusKm ?? 10,
                note: 'Only businesses with a resolved coordinate can match a radius. Ones with an address and no coordinate are absent from this result rather than excluded by it.',
              },
            }),
        /* The wording is the product. "Lacks" here means a probe looked and
           found nothing, which is not the same as absence, and saying so in
           the payload means a client cannot label the column wrongly by
           accident. */
        note: a.lacks !== undefined
          ? 'A capability listed under `lacks` was looked for and not observed in the sources checked. That is not the same as the business not having it.'
          : undefined,
      });
    }

    if (a.domain !== undefined) return reply.send({ entities: await Q.findByDomain(d, a.domain) });
    if (a.category !== undefined) return reply.send({ entities: await Q.findByCategory(d, a.category, a.limit) });

    const plain = await Q.findEntities(d, { ...(a.type !== undefined ? { type: a.type } : {}), limit: a.limit });
    return reply.send({ entities: inArea === null ? plain : plain.filter((e) => inArea.has(e.id)) });
  });

  app.get('/v1/entities/:id', async (req, reply) => {
    const p = parse(Uuid, req.params);
    if (!p.ok) return reply.code(400).send({ error: 'invalid entity id', detail: p.detail });
    const d = await getDriver();

    const entity = await Q.getEntity(d, p.data.id);
    if (entity === null) return reply.code(404).send({ error: 'no such entity' });

    const capabilities: Record<string, unknown> = {};
    for (const cap of ['website', 'ecommerce', 'social', 'booking']) {
      capabilities[cap] = await Q.getCapability(d, p.data.id, cap);
    }
    return reply.send({
      entity,
      capabilities,
      relationships: await Q.getRelationships(d, p.data.id),
      coverage: await Q.getCoverage(d, p.data.id),
    });
  });

  app.get('/v1/entities/:id/evidence', async (req, reply) => {
    const p = parse(Uuid, req.params);
    if (!p.ok) return reply.code(400).send({ error: 'invalid entity id', detail: p.detail });
    const d = await getDriver();
    const chain = await Q.getEntityEvidence(d, p.data.id);
    if (chain.length === 0 && (await Q.getEntity(d, p.data.id)) === null) {
      return reply.code(404).send({ error: 'no such entity' });
    }
    return reply.send({ claims: chain });
  });

  /** Located entities, for the map. Nothing without coordinates is invented. */
  app.get('/v1/map', async (req, reply) => {
    const q = z.object({
      lat: z.coerce.number().min(-90).max(90).optional(),
      lon: z.coerce.number().min(-180).max(180).optional(),
      radiusKm: z.coerce.number().positive().max(500).default(25),
      limit: z.coerce.number().int().min(1).max(500).default(200),
    });
    const parsed = parse(q, req.query);
    if (!parsed.ok) return reply.code(400).send({ error: 'invalid query', detail: parsed.detail });
    const a = parsed.data;
    const d = await getDriver();

    if (a.lat !== undefined && a.lon !== undefined) {
      return reply.send({ located: await Q.findNearby(d, a.lat, a.lon, a.radiusKm), centre: { lat: a.lat, lon: a.lon } });
    }

    /*
     * Businesses only.
     *
     * The pipeline creates entities for a business's website and for each of
     * its contact points, and counting those as "not placed" made a map of four
     * shops report five businesses it could not locate. A contact point is not
     * somewhere.
     */
    const rows = await d.query<Record<string, unknown>>(
      /*
       * Who placed each point, and how precisely.
       *
       * `declared` means the business's own page published coordinates; a
       * provider name means a gazetteer was asked. A map that cannot tell a
       * reader which is which invites them to treat a third party's guess as the
       * subject's own statement — and `geocode_precision` is what separates a
       * shop front from a town centre.
       */
      `select e.id, e.canonical_name as name, e.type, l.latitude, l.longitude, l.geocode,
              l.geocode_provider, l.geocode_precision, l.geocode_matched, l.city, l.country
         from entity e join entity_location l on l.entity_id = e.id
        where e.status = 'ACTIVE' and e.type = 'ORGANIZATION' and l.latitude is not null
        limit $1`,
      [a.limit],
    );
    const unlocated = await d.query<{ n: string }>(
      `select count(*)::text as n from entity e
        where e.status = 'ACTIVE' and e.type = 'ORGANIZATION'
          and not exists (select 1 from entity_location l where l.entity_id = e.id and l.latitude is not null)`,
    );
    return reply.send({
      located: rows,
      /* Stated, not omitted. A map that silently shows only the businesses it
         happens to have coordinates for reads as a complete picture. */
      unlocated: Number(unlocated[0]?.n ?? 0),
      note:
        'Only businesses with a resolved coordinate appear. Nothing is geocoded speculatively, and a point that ' +
        'resolved only to an area is recorded as unresolved rather than plotted.',
    });
  });

  /* ---- handoff ------------------------------------------------------------ */

  /**
   * One job, as a self-contained document somebody else can read.
   *
   * Everything travels: the question, the plan, the findings, every citation
   * with its quote and URL, the cost and the limitations. A handoff that
   * carried only conclusions would be exactly the artefact this whole system
   * exists to avoid producing.
   */
  app.get('/v1/jobs/:id/handoff', async (req, reply) => {
    const p = parse(Uuid, req.params);
    if (!p.ok) return reply.code(400).send({ error: 'invalid job id', detail: p.detail });
    const d = await getDriver();

    const jobRows = await d.query<Record<string, unknown>>(
      `select id, question, intent, state, termination, limitations, model_calls, tool_calls,
              pages_crawled, searches, tokens_in, tokens_out, cost_micros, created_at, finished_at
         from job where id = $1`,
      [p.data.id],
    );
    const job = jobRows[0];
    if (job === undefined) return reply.code(404).send({ error: 'no such job' });

    const runIds = await runIdsForJob(d, p.data.id);
    const findings =
      runIds.length === 0
        ? []
        : await d.query<Record<string, unknown>>(
            `select f.id, f.statement, f.status, f.finding_type, f.reasoning_type, f.rule_id,
                    f.limitations, e.canonical_name as entity_name
               from finding f
               left join entity e on e.id = f.entity_id
              where f.audit_run_id = any($1::uuid[])
                and f.verification <> 'REJECTED' and coalesce(f.status,'') <> 'UNSUPPORTED'
              order by f.ord`,
            [runIds],
          );
    const withCitations = [];
    for (const f of findings) {
      withCitations.push({
        ...f,
        citations: await d.query<Record<string, unknown>>(
          'select quote, url, retrieved_at from finding_citation where finding_id = $1',
          [f.id as string],
        ),
      });
    }
    const artifacts = await d.query<Record<string, unknown>>(
      `select a.kind, a.title, a.body, a.limitations, a.created_at
         from research_artifact a
        where a.body ->> 'jobId' = $1`,
      [p.data.id],
    );

    return reply.send({
      format: 'hi-anzy-audit/handoff@1',
      exportedAt: new Date().toISOString(),
      job,
      findings: withCitations,
      artifacts,
      /* Said in the document itself, because a handoff outlives the context it
         was produced in and the reader will not have this conversation. */
      readThisFirst: [
        'Every statement here is either a source quoting itself or a rule applied to stored evidence.',
        'A capability reported as NOT_OBSERVED was looked for and not found in the sources checked. It is not a statement that the business lacks it.',
        'Recommendations carry no citations because they are advice about something that has not happened.',
        'The limitations are part of the finding, not a disclaimer attached to it.',
      ],
    });
  });
}

/**
 * Which layer-4 runs belong to this job.
 *
 * Read from the task outputs rather than from `task.audit_run_id`, because one
 * analyse task answers for every subject it was given and therefore produces
 * several runs. The column holds the single-run case for convenience; this is
 * the complete answer, and a findings view that missed five of six subjects
 * would be worse than one that was slower.
 */
async function runIdsForJob(d: Awaited<ReturnType<typeof getDriver>>, jobId: string): Promise<string[]> {
  const rows = await d.query<{ output: unknown }>(
    `select output from task where job_id = $1 and output is not null order by ord`,
    [jobId],
  );
  const ids = new Set<string>();
  for (const r of rows) {
    const parsed = typeof r.output === 'string' ? JSON.parse(r.output) : r.output;
    for (const id of runIdsIn(parsed)) ids.add(id);
  }
  return [...ids];
}

function presentFinding(f: {
  statement: string;
  status: string;
  findingType: string;
  reasoningType: string;
  ruleId: string | null;
  citations: string[];
  limitations: string;
  entityId: string | null;
  area: string | null;
}): Record<string, unknown> {
  return {
    statement: f.statement,
    status: f.status,
    type: f.findingType,
    reasoning: f.reasoningType,
    rule: f.ruleId,
    citations: f.citations,
    limitations: f.limitations,
    entityId: f.entityId,
    area: f.area,
  };
}

function presentJobResult(r: Awaited<ReturnType<typeof runJob>>): Record<string, unknown> {
  return {
    jobId: r.jobId,
    state: r.state,
    termination: r.termination,
    iterations: r.iterations,
    ledger: { ...r.ledger },
    answers: r.answers,
    limitations: r.limitations,
    tasks: r.tasks.map((t) => ({ key: t.key, kind: t.kind, agent: t.agent, state: t.state, attempts: t.attempts })),
  };
}
