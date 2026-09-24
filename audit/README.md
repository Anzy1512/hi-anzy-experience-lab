# HI ANZY — AUDIT SERVICE

An OSINT-backed business audit engine: crawl real sources, index them, retrieve
against a question, and produce findings a person can act on — with the passage
behind every one of them kept on record.

It lives in this repository and is **not part of the Experience Lab build**. It
has its own `package.json`, its own dependency tree, its own tsconfig, and the
Lab's eslint config ignores it by name. `npm ci && npm run build` at the
repository root still resolves 173 packages and still produces a Lab that runs
with no backend in existence. That is deliberate and it is checked.

---

## WHY THIS EXISTS

The Agency Simulator gives a deterministic reading: a sentence plus five
constraints, mapped onto the company's own taxonomy, with every line marked
FACT, DERIVED, UNKNOWN or RECOMMENDATION. It is honest and it is not an audit —
it knows nothing about the business in front of it.

This service is the other half. Same vocabulary, real evidence.

---

## THE ONE RULE THAT DID NOT GET LIFTED

The AI, backend, automation and dependency rules were lifted for this work.
**"Never fabricate business facts" was not**, and this service is built so that
it cannot.

Findings render as plain prose — no `[SOURCED]` tags in the reader's face. What
makes that safe rather than merely confident is underneath:

- every finding carries a `basis` of `sourced`, `derived` or `unsupported`;
- every `sourced` finding has at least one row in `finding_citation` holding the
  quote, the URL and the moment it was retrieved;
- a finding that reaches the database with no citation is `unsupported` **by
  definition and does not render**;
- when the corpus has nothing, the run ends `insufficient_evidence`, which is a
  result rather than an error.

The prose reads plainly. The record stays auditable. Those are not in tension.

---

## LAYERS

Built one over another. Each is runnable and verified before the next starts.

| | Layer | State |
|---|---|---|
| **1** | **Corpus + service foundation** — schema, migrations, dual driver, security baseline, health | **DONE, verified** |
| **2** | **Discovery → crawl → extract → chunk → embed → index → retrieve**, with provenance at every step | **DONE, verified** |
| 3 | Subject resolution, evidence assembly, scheduled enrichment | next |
| 4 | Synthesis — findings against the canonical areas | |
| 5 | API + Agency Simulator integration | |
| 6 | Continuous enrichment — freshness decay, re-crawl policy | |
| 7 | Evaluation / training export — the dataset layers 1 and 2 have been accumulating all along | |

---

## LAYER 2

```
QUERY → SEARCH → URL CANDIDATES → FETCH → VALIDATE → EXTRACT
      → NORMALIZE → CHUNK → EMBED → INDEX → RETRIEVE
```

No model is called anywhere in that line, and none is needed. Every stage is
selectors, hashes, structure and SQL.

### The provider abstraction

The pipeline takes `Discovery[]` and has no access to a provider object, no
provider-shaped branches, and no way to ask which engine produced a result
beyond a label it only writes down. Four implementations exist against one
contract — SearXNG, Brave, Tavily and **direct URL ingestion, which is a
provider too**. That last one is the design decision worth noticing: making
direct URLs a provider means "search unavailable but direct ingestion still
works" is not a code path anyone has to maintain, it is the ordinary behaviour
of a registry with one provider in it.

SearXNG is the default because it is self-hosted: nothing per query, and no
third party receives a log of which companies are being investigated.

**A snippet is never evidence.** Every provider returns one; every snippet is a
sentence the page may not contain. They are stored in `discovery` for
provenance and read by nothing downstream. A test asserts structurally that no
chunk in the corpus is equal to any snippet.

### The crawler

| Guard | What it stops |
|---|---|
| scheme allowlist | `file:`, `javascript:`, and anything a redirect tries to switch to |
| address validation | private, loopback, link-local, ULA, CGNAT, IPv4-mapped IPv6 — **every** resolved address, not the first |
| redirect re-validation | a public URL that 302s somewhere internal, which is what defeats an input-only check |
| redirect limit | loops |
| robots | `Disallow`; a 5xx, 403 or HTML robots.txt is a refusal, never permission |
| content-type allowlist | binaries downloaded to discover they cannot be read |
| declared size | a large `Content-Length`, before a byte is read |
| streamed size | a body with no declared length, and a small gzip that expands to gigabytes |
| timeout + backoff | slow servers; retries only 408/425/429/5xx, never a 404 |
| per-host rate + concurrency | being indistinguishable from an attack |

Nothing here attempts to get around anything: no credential is presented, no
paywall defeated, no bot check solved. A refusal is an **outcome** — recorded
on `discovery.outcome` and `document.outcome` — not an exception.

### The version policy

| Result | What happens |
|---|---|
| **new** | insert at version 1, chunk, embed |
| **unchanged** (304, or matching sha256) | `last_seen_at` moves. **Nothing else.** No re-extract, no re-chunk, no re-embed |
| **changed** | outgoing version recorded in `document_revision`, version increments, chunks replaced |

And inside the expensive case: chunks whose sha256 did not move **keep their
vectors**. A page that changed one paragraph re-embeds one paragraph.

### Chunking follows the document

Headings start sections, paragraphs accumulate, and a fixed window appears in
exactly one place — a single paragraph past the hard maximum, split on sentence
boundaries. A sliding token window cuts sentences in half, and half a sentence
embeds to somewhere no query lands, so the passage becomes unretrievable in a
way that is indistinguishable from "the corpus does not contain that".

The heading trail is prepended to what is **embedded** and kept out of what is
**quoted**. "Under £2m" means nothing; "Pricing > Retainers > Under £2m" is a
fact.

### Embeddings

The boundary is real and the expensive option is **not installed**.
`LocalTransformerEmbedder` (bge-small-en-v1.5) imports
`@huggingface/transformers` dynamically and reports "not installed" until one
command is run. The default is a deterministic hashing projection that is free,
offline and identical on every machine — and that **declares `semantic: false`
about itself**, because a dense index built on it returns results, in an order,
quickly, while contributing nothing the lexical index did not already have.
`RetrievalReport.semanticDense` carries that flag outward so no caller can
mistake one for the other.

### Hybrid retrieval

Reciprocal Rank Fusion, `1 / (60 + rank)`, rather than a weighted blend: a
cosine distance and a `ts_rank_cd` are not comparable quantities and any
constant tuned to mix them silently stops being right as the corpus grows. RRF
keeps only the ordering, so it needs no tuning.

Diversity is enforced, not hoped for: caps per document and per domain. Five
passages from one page is five slots of budget spent on one claim — worse than
waste, because it reads like corroboration. The budget is a **token** ceiling
as well as a count, and a passage that does not fit is skipped rather than
truncated.

### Measured, on this machine

`npx tsx src/bench.ts` — 11.2 kB page, 40 paragraphs, 10 sections:

| Stage | PGlite | Postgres 17 |
|---|---|---|
| extraction (×20) | 5.0 ms | 5.0 ms |
| chunking (×50) | 0.1 ms | 0.1 ms |
| embedding, 10 chunks | 32.7 ms | 30.2 ms |
| ingest, first time | 236.9 ms | 116.7 ms |
| **ingest, unchanged recrawl** | **16.6 ms** | **14.0 ms** |
| retrieval | 4.5–16.3 ms | 3.8–15.4 ms |

**Embedding already dominates the deterministic path** — 3.0–3.3 ms per chunk
against 0.1 ms for chunking — which is the number that matters for the decision
this layer was told to defer. A real transformer will be slower still, so the
re-embed-only-what-moved rule and the unchanged-recrawl path are not
micro-optimisations; they are the difference between a corpus that can be kept
fresh and one that cannot.

The unchanged recrawl is **88–93% faster and does zero embedding work.**

### Layer 7 is why layer 1 looks like this

Fine-tuning was chosen as the second step after retrieval. The obstacle is that
the labelled dataset does not exist — and a dataset does not come into being
later because someone decides to want one. It comes from a system that has been
writing it down from the first run.

So three tables are not instrumentation:

```
retrieval   the question, and which chunks ranked where, and which reached the prompt
finding     what the model concluded from them
feedback    whether a human agreed, and how it was wrong if it was
```

One row per triple is one training example. Nothing else has to be remembered.

`feedback.verdict` separates `wrong` from `unsupported` on purpose: a finding
can be true and still not be what the cited passage said, and those two failures
need different fixes — one is a retrieval problem, the other is a generation
problem, and averaging them teaches neither.

---

## THE VOCABULARY IS ALREADY DECIDED

`finding.area` is a Postgres enum of the eleven canonical `DIAGNOSTIC_AREAS`,
and `finding.outcome` is the seven canonical `DIAGNOSTIC_OUTCOMES`, both read
from `hi-anzy-website-2.0 @ 0208378` and mirrored in the Lab at
`src/content/canonical.ts`.

That is not decoration. It means the deterministic Simulator and this service
speak one language, a real audit drops into the surface the Lab already built,
and **neither side can invent a category to make an answer fit** — the database
rejects it.

---

## RUNNING IT

```bash
cd audit
npm install
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"   # paste into API_KEY
npm run migrate
npm run check     # the doctor: 12 checks, and it proves retrieval rather than asserting it
npm run dev
```

No database to install. With `DATABASE_URL` unset it runs on **PGlite** — real
Postgres compiled to WebAssembly, in-process, with pgvector and `pg_trgm`. Not a
mock: same SQL, same types, same `<=>` operator, same generated `tsvector`.

For a server — which a continuous crawler needs, because PGlite is
single-connection:

```bash
docker compose up -d
DATABASE_URL=postgres://audit:audit@127.0.0.1:5433/audit npm run migrate
DATABASE_URL=postgres://audit:audit@127.0.0.1:5433/audit npm run check
```

Both paths were run. Both return **ALL 12 CHECKS PASS**, down to the same
lexical rank — the upgrade is a connection string.

---

## WHAT LAYER 1 ACTUALLY PROVES

`npm run check` does not read catalogue tables and report what it finds. A
migration that returns cleanly can still leave a database with no vector index,
a full-text column that never populates, or an embedding width that disagrees
with the application — each of which behaves correctly and slowly, or correctly
and emptily, and none of which announces itself.

So the doctor writes a document, chunks it, embeds it with known vectors, and
asks the database to retrieve it **both ways**:

```
OK  dense retrieval        nearest is ord 1 at distance 0
OK  lexical retrieval      top match is ord 0 at rank 0.26691276
OK  hybrid is worth having dense top=1, lexical top=0 — different passages
OK  cascade delete         0 chunks remain after deleting the source
```

That third line is the design argument, executed. Dense vectors find what a
passage *means* and reliably miss exact tokens — a company number, a filing
code, a product name. Lexical finds those and misses paraphrase. Running both
and fusing the ranks puts the right passage in the top few rather than the top
forty, **and the number of passages you put in front of a model is the bill.**

Hybrid retrieval is in this design as a cost decision before it is a quality
one.

---

## COST, SINCE IT WAS ASKED FOR EXPLICITLY

| Decision | Why it is the cheap one |
|---|---|
| Local embeddings, 384-dim | bge-small-en-v1.5 runs in-process. Zero marginal cost per token and nothing leaves the machine to be embedded. |
| Hybrid retrieval | Fewer, better passages in the prompt. This is the largest single lever on spend. |
| `document.content_hash` | A re-crawl that finds unchanged text costs nothing: no re-chunk, no re-embed. Most re-crawls find unchanged text. |
| Extract before embed | Boilerplate — nav, footers, cookie banners — is stripped before anything is chunked. |
| Small model for extraction, strong model for synthesis | The high-volume work is the cheap work. |
| `audit_run.tokens_in/out/cost_micros` | Spend recorded per run, not estimated afterwards. |

---

## SECURITY

Part of layer 1, not a hardening pass later — this service takes outbound
actions on a stranger's instruction.

- **Nothing responds without a key**, compared in constant time. Verified: a
  wrong key *of the same length* is rejected.
- **Every route is rate limited**, including ones that fail auth, keyed by API
  key where there is one and by IP where there is not. Verified: 59×200 then
  11×429 against a limit of 60.
- **Errors never carry internals outward** — logged in full, returned as a
  status and a request id.
- **Secrets are redacted from logs** (`authorization`, `x-api-key`, `cookie`).
- **Parameterised SQL only.** The driver exposes `query(text, params)` for
  everything the application does; `exec()` takes no parameters and is reachable
  only by the migration runner.
- **`CRAWL_ALLOW_PRIVATE_NETWORKS` defaults false** and is enforced in layer 2.
  Without it, anyone who can submit a URL can point this service at cloud
  metadata endpoints or at anything else reachable from the network it runs in.
  It is declared in layer 1 so that it cannot be *forgotten* in layer 2 — only
  deliberately disabled.
- Body limit 256 KB. A crawl request is a URL and a few options.

### Not yet true

Auth is a single shared key. That is right for a service with one caller and
wrong for more than one, because there is no way to revoke one without
revoking all. Per-caller keys belong with the API layer, and are named here
rather than discovered later.

---

## LAYOUT

```
audit/
  docker-compose.yml     pgvector/pgvector:pg17 on 127.0.0.1:5433
  drizzle.config.ts      generates DDL from schema.ts. Does not apply it.
  migrations/
    0000_core.sql        generated — tables, enums, btree indexes
    9000_search_indexes.sql  hand-written — HNSW, GIN, trigram, generated tsvector
  src/
    config.ts            every knob, validated once, loudly, at startup
    server.ts            Fastify + the security baseline + health
    index.ts             migrate, listen, shut down cleanly
    db/
      schema.ts          the corpus, the subject, the audit, the label
      client.ts          PGlite | node-postgres behind four methods
      migrate.ts         numbered SQL, applied once, recorded by hash
      doctor.ts          proves retrieval works rather than asserting it
      reset.ts           guarded. Refuses on production, refuses without --yes
```

### Two things the migration runner does on purpose

**Extensions are a precondition, not a migration.** `vector` has to exist before
the generated DDL can create a `vector(384)` column, and the generator owns the
lowest file numbers, so there is nowhere to put a migration that runs first.
Both `create extension` calls are idempotent and run at every boot.

**Applied migrations are immutable.** The runner stores a hash and refuses to
proceed if a file that has already run has since been edited. Editing an applied
migration is the quiet way two environments stop being the same database.

### And one thing the hand-written migration exists for

An HNSW index wants its own operator class, the full-text column wants to be
`GENERATED ALWAYS`, and neither is expressible in a TypeScript schema builder. A
generator that silently omits them produces a database that works and is slow in
a way nobody attributes to the ORM.

HNSW rather than IVFFlat because IVFFlat needs representative data present
before its lists mean anything, and this table starts empty.
