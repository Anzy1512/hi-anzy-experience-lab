import { timingSafeEqual } from 'node:crypto';
import Fastify, { type FastifyError, type FastifyInstance, type FastifyRequest } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';

import { config, corsOrigins, usingPglite } from './config.ts';
import { getDriver, vectorReady } from './db/client.ts';
import { EMBEDDING_DIM } from './db/schema.ts';
import { ProviderRegistry } from './search/providers.ts';
import { getEmbedder } from './embed/index.ts';
import { productRoutes } from './api/routes.ts';

/**
 * THE SERVICE, AND THE THREE THINGS IT REFUSES TO DO WITHOUT.
 *
 * This service will, by the end of the build, accept a company name from a
 * caller, search the open web for it, fetch what it finds, and hand the result
 * to a paid model. Every one of those is an outbound action taken on a
 * stranger's instruction. The security baseline is therefore part of layer one
 * rather than a hardening pass later, because "add auth before launch" is a
 * sentence that has preceded most of the incidents worth reading about.
 *
 *   1. Nothing responds without a key, and the comparison is constant-time.
 *   2. Every route is rate limited, including the ones that fail auth.
 *   3. Errors never carry internals outward.
 *
 * The fourth — that a caller cannot aim the crawler at the network this runs
 * in — belongs to the fetch layer and is written down in `config.ts` so it is
 * not discovered to be missing.
 */

const PUBLIC_ROUTES = new Set(['/health/live']);

/**
 * Constant-time key comparison.
 *
 * `===` on a secret leaks its prefix through timing. That is a small leak and
 * an avoidable one, and `timingSafeEqual` throws on a length mismatch, so the
 * lengths are compared first — deliberately, since key LENGTH is not the
 * secret and rejecting early on it is correct.
 */
function keyMatches(presented: string): boolean {
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(config.API_KEY, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function presentedKey(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7);
  const alt = req.headers['x-api-key'];
  if (typeof alt === 'string') return alt;
  return null;
}

export async function build(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      ...(config.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }
        : {}),
      /* A key that reaches the log is a key that has to be rotated. */
      redact: {
        paths: ['req.headers.authorization', 'req.headers["x-api-key"]', 'req.headers.cookie'],
        censor: '[redacted]',
      },
    },
    /* A crawl request is a URL and a few options. Anything larger is a mistake
       or an attempt, and either way it should not be buffered. */
    bodyLimit: 256 * 1024,
    trustProxy: false,
  });

  await app.register(sensible);
  await app.register(helmet, {
    /* This serves JSON to programs, never HTML to browsers, so the policy can
       be the strict one rather than the one that keeps a page working. */
    contentSecurityPolicy: { directives: { 'default-src': ["'none'"], 'frame-ancestors': ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'same-origin' },
  });

  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
    /*
     * Keyed by API key where there is one, by IP where there is not. Keying on
     * IP alone lets one caller behind a shared address exhaust everyone's
     * budget; keying on the key alone leaves unauthenticated traffic
     * unthrottled, which is exactly the traffic worth throttling.
     */
    keyGenerator: (req) => presentedKey(req) ?? req.ip,
  });

  /*
   * CORS, by hand and by allowlist, BEFORE authentication.
   *
   * Twenty lines rather than a dependency: exact origins from configuration,
   * no credentials, no wildcard, no pattern matching. The dangerous parts of
   * CORS are all in the features not used here, and a version that cannot
   * express them cannot get them wrong.
   *
   * The order is the part that matters and the part that was wrong first time.
   * A GET carrying an `authorization` header is not a simple request, so the
   * browser sends an OPTIONS preflight — with no credentials, because it never
   * sends them on one. Registered after the auth hook, that preflight is
   * answered 401 with no CORS headers, and every request from the browser fails
   * with "Failed to fetch" for a reason that has nothing to do with the key.
   * Found by opening the page rather than by reading the code.
   */
  if (corsOrigins.length > 0) {
    app.addHook('onRequest', async (req, reply) => {
      const origin = req.headers.origin;
      if (typeof origin !== 'string' || !corsOrigins.includes(origin)) return;
      reply.header('access-control-allow-origin', origin);
      reply.header('vary', 'origin');
      reply.header('access-control-allow-headers', 'authorization, x-api-key, content-type');
      reply.header('access-control-allow-methods', 'GET, POST, OPTIONS');
      reply.header('access-control-max-age', '600');
      if (req.method === 'OPTIONS') await reply.code(204).send();
    });
  }

  /* ---- authentication ---------------------------------------------------- */
  app.addHook('onRequest', async (req, reply) => {
    /* A preflight carries no credentials by definition; it is answered above
       when the origin is allowed, and refused by the browser when it is not. */
    if (req.method === 'OPTIONS') return;
    if (PUBLIC_ROUTES.has(req.url.split('?')[0] ?? '')) return;
    const presented = presentedKey(req);
    if (presented === null || !keyMatches(presented)) {
      /* No hint about which part was wrong, and no timing difference between
         a missing key and a wrong one that matters at this granularity. */
      return reply.code(401).send({ error: 'unauthorised' });
    }
    return;
  });

  /* ---- errors ------------------------------------------------------------ */
  app.setErrorHandler((err: FastifyError, req, reply) => {
    const status = err.statusCode ?? 500;
    /* Log everything, return nothing. A stack trace in a response body is a
       map of the filesystem for anyone collecting them. */
    if (status >= 500) req.log.error({ err }, 'request failed');
    else req.log.warn({ err: err.message }, 'request rejected');
    reply.code(status).send({
      error: status >= 500 ? 'internal error' : err.message,
      requestId: req.id,
    });
  });

  await app.register(productRoutes);

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({ error: 'not found', path: req.url });
  });

  /* ---- liveness: is the process up ---------------------------------------- */
  app.get('/health/live', async () => ({ ok: true, service: 'hi-anzy-audit', version: '0.1.0' }));

  /* ---- readiness: is it actually able to do its job ----------------------- */
  app.get('/health/ready', async (_req, reply) => {
    const checks: Record<string, { ok: boolean; detail: string }> = {};

    try {
      const d = await getDriver();
      const t0 = performance.now();
      await d.query('select 1');
      checks.database = {
        ok: true,
        detail: `${d.kind}, responded in ${(performance.now() - t0).toFixed(1)}ms`,
      };

      const v = await vectorReady(d);
      checks.pgvector = v;

      const rows = await d.query<{ n: string }>("select count(*)::text as n from _migration");
      checks.migrations = { ok: Number(rows[0]?.n ?? 0) > 0, detail: `${rows[0]?.n ?? 0} applied` };

      const corpus = await d.query<{ documents: string; chunks: string; embedded: string }>(
        `select (select count(*) from document)::text as documents,
                (select count(*) from chunk)::text as chunks,
                (select count(*) from chunk where embedding is not null)::text as embedded`,
      );
      const c = corpus[0];
      checks.corpus = {
        /* An empty corpus is the correct state before ingestion exists, so it
           is reported rather than failed. What would be wrong is chunks that
           are stored and never embedded, because those are invisible to
           retrieval while looking present in every count. */
        ok: c === undefined || c.chunks === c.embedded,
        detail: c
          ? `${c.documents} documents, ${c.chunks} chunks, ${c.embedded} embedded`
          : 'unreadable',
      };
    } catch (e) {
      checks.database = { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }

    const ready = Object.values(checks).every((c) => c.ok);
    return reply.code(ready ? 200 : 503).send({
      ready,
      driver: usingPglite ? 'pglite' : 'postgres',
      embeddingDim: EMBEDDING_DIM,
      /* What this service can and cannot do yet, stated rather than implied.
         A caller should not have to discover by 404 that ingestion is not
         built; the Lab's own habit of naming what is missing applies here. */
      capabilities: {
        corpus: true,
        ingestion: true,
        retrieval: true,
        /* Layers 4 and 5, both built. `/v1/capabilities` says the same thing
           in more detail; this stays so a readiness probe is self-contained. */
        synthesis: true,
        jobs: true,
        search: config.SEARCH_PROVIDER !== 'none',
        /* Direct URL ingestion never depends on a search provider, so this is
           true whether or not one is configured. It is the reason the service
           is useful with no discovery at all. */
        directIngestion: true,
        model: config.ANTHROPIC_API_KEY !== undefined,
      },
      /*
       * Every provider, and whether it can answer right now. A provider that
       * is unavailable is an ordinary state, not an error, so it belongs in a
       * readiness body rather than in a log somebody has to go and find.
       */
      providers: await ProviderRegistry.fromConfig().report(),
      embedding: await (async () => {
        const e = getEmbedder();
        const a = await e.available();
        return { id: e.id, dimensions: e.dimensions, semantic: e.semantic, ...a };
      })(),
      checks,
    });
  });

  return app;
}
