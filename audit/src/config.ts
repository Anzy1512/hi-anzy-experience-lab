import { z } from 'zod';
import 'dotenv/config';

/**
 * EVERY KNOB THIS SERVICE HAS, VALIDATED BEFORE IT STARTS.
 *
 * ── WHY THIS IS THE FIRST FILE ──────────────────────────────────────────────
 *
 * A service that crawls the open web, calls a paid model and stores what it
 * learns about real companies has exactly two failure modes that matter: it
 * runs with a secret it should not have, or it runs without one and discovers
 * that four layers deep at three in the morning. Parsing the environment once,
 * loudly, at startup removes the second and makes the first visible.
 *
 * Nothing below reads `process.env` again. If a value is not here, the service
 * does not have it.
 */

/**
 * An unset variable and a variable set to nothing are the same thing.
 *
 * `.env` files carry empty keys as documentation — `DATABASE_URL=` is how you
 * say "there is one, and you are not using it". Zod sees a present empty
 * string and reports "Invalid URL", which is technically correct and useless.
 * Every optional value below is read through this.
 */
const blank = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), inner);

/**
 * A flag, from an environment that only has strings.
 *
 * The default is taken as a boolean and applied before parsing rather than
 * after, because an absent variable and the string "false" should reach the
 * rest of the service as the same value, and chaining `.default()` onto a
 * transform leaves it ambiguous which side of the transform it lands on.
 */
const bool = (fallback: boolean) =>
  z.preprocess(
    (v) => (v === undefined || v === '' ? fallback : String(v).trim().toLowerCase()),
    z.union([
      z.boolean(),
      z.enum(['true', 'false', '1', '0', 'yes', 'no']).transform((s) => s === 'true' || s === '1' || s === 'yes'),
    ]),
  );

const Schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),

  /**
   * Where the corpus lives.
   *
   * Absent, the service runs on PGlite — real Postgres compiled to WASM, in
   * this process, with `vector` available. That is not a toy substitute chosen
   * to avoid setup: it is the same SQL, the same types and the same extension,
   * so the migration to a server is a connection string rather than a rewrite.
   * It is single-connection and in-process, which is correct for building and
   * wrong for a crawler running continuously, so production sets this.
   */
  DATABASE_URL: blank(z.string().url().optional()),
  /** Where PGlite keeps its files when DATABASE_URL is absent. */
  PGLITE_DIR: z.string().default('./.data/pglite'),

  /**
   * The embedding width the `chunk` table is built for.
   *
   * Changing it is a migration, not a setting — a pgvector column has a fixed
   * dimension and every stored row would have to be re-embedded. 384 is
   * bge-small-en-v1.5, which runs locally at no marginal cost.
   */
  EMBEDDING_DIM: z.coerce.number().int().min(64).max(4096).default(384),

  /**
   * The key callers present. Generated, never defaulted: a service with a
   * guessable key and a crawler attached is a server-side request forgery
   * appliance with a REST interface.
   */
  API_KEY: z.string().min(32, 'API_KEY must be at least 32 characters'),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),

  /** Model access. Not required until the synthesis layer exists. */
  ANTHROPIC_API_KEY: blank(z.string().optional()),
  /** Web search. Not required until the ingestion layer exists. */
  SEARCH_PROVIDER: z.enum(['none', 'brave', 'tavily', 'searxng']).default('none'),
  SEARCH_API_KEY: blank(z.string().optional()),
  SEARXNG_URL: blank(z.string().url().optional()),

  /**
   * Crawler manners, and the one that is not manners.
   *
   * `CRAWL_ALLOW_PRIVATE_NETWORKS` defaults to false and should stay false.
   * The moment this service fetches a URL a caller supplied, it can be pointed
   * at 169.254.169.254, at a database on localhost, or at anything else inside
   * the network it happens to be running in. The guard that stops that is in
   * the fetch layer; this flag exists so that turning it off is a deliberate,
   * greppable act rather than an omission.
   */
  CRAWL_USER_AGENT: z
    .string()
    .default('hi-anzy-audit/0.1 (+https://hianzy.com; research crawler; contact via site)'),
  CRAWL_RESPECT_ROBOTS: bool(true),
  CRAWL_ALLOW_PRIVATE_NETWORKS: bool(false),
  CRAWL_PER_HOST_RPS: z.coerce.number().positive().default(0.5),
  CRAWL_MAX_BYTES: z.coerce.number().int().positive().default(2_500_000),
  CRAWL_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
});

export type Config = z.infer<typeof Schema>;

function load(): Config {
  const parsed = Schema.safeParse(process.env);
  if (parsed.success) return parsed.data;

  const lines = parsed.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`);
  console.error(
    ['', 'The audit service cannot start: its environment is not valid.', '', ...lines, '', 'See audit/.env.example.', ''].join('\n'),
  );
  process.exit(1);
}

export const config = load();

/** True when the corpus is in-process rather than on a server. */
export const usingPglite = config.DATABASE_URL === undefined;
