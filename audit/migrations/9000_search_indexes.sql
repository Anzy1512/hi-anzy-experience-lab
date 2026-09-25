-- SEARCH: the two indexes retrieval actually runs on, and the column one needs.
--
-- Numbered in a 9000 band because everything below 1000 is generated from
-- src/db/schema.ts by drizzle-kit. Keeping the bands apart means a future
-- `drizzle-kit generate` never collides with a hand-written file, and it is
-- obvious at a glance which files a generator owns.
--
-- Everything here is what a TypeScript schema builder cannot express, which is
-- also why it would have been silently missing: a database with no vector index
-- works perfectly and scans every row, and nobody attributes that to the ORM.

-- ---------------------------------------------------------------------------
-- The lexical half of hybrid retrieval.
--
-- Generated rather than maintained by a trigger. A trigger is one more thing
-- that can be dropped, disabled or forgotten in a restore; a generated column
-- cannot disagree with the text it is generated from. The column was created
-- plain by the generator, so it is replaced here while the table is empty.
-- ---------------------------------------------------------------------------
ALTER TABLE "chunk" DROP COLUMN IF EXISTS "tsv";
ALTER TABLE "chunk"
  ADD COLUMN "tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', "text")) STORED;

CREATE INDEX IF NOT EXISTS "chunk_tsv_gin" ON "chunk" USING gin ("tsv");

-- ---------------------------------------------------------------------------
-- The dense half.
--
-- Cosine, because the embeddings are normalised and cosine is what
-- bge-small-en-v1.5 was trained against; using L2 on normalised vectors ranks
-- the same but makes every threshold in the codebase mean something different.
--
-- HNSW rather than IVFFlat: IVFFlat needs representative data present before
-- its lists mean anything, and this table starts empty. An index built on an
-- empty table and then filled is exactly the case IVFFlat handles badly.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "chunk_embedding_hnsw"
  ON "chunk" USING hnsw ("embedding" vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- Subject resolution.
--
-- Attaching an audit to the wrong company is the worst failure this service
-- has, and exact matching does not find "Acme Ltd" from "Acme Limited".
-- Trigram similarity does, as a CANDIDATE — never as a decision. What promotes
-- a candidate to a link is subject_identifier, and the basis is recorded.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "subject_name_trgm"
  ON "subject" USING gin ("name" gin_trgm_ops);
