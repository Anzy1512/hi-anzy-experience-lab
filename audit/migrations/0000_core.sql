CREATE TYPE "public"."diagnostic_area" AS ENUM('Business', 'Brand', 'Customer', 'Sales', 'Marketing', 'Technology', 'Data', 'Operations', 'Automation', 'Security', 'Growth');--> statement-breakpoint
CREATE TYPE "public"."diagnostic_outcome" AS ENUM('What is happening', 'Why it matters', 'What it is costing you', 'What should change', 'What happens first', 'Who should own it', 'How success gets measured');--> statement-breakpoint
CREATE TYPE "public"."feedback_verdict" AS ENUM('correct', 'wrong', 'unsupported', 'unclear');--> statement-breakpoint
CREATE TYPE "public"."finding_basis" AS ENUM('sourced', 'derived', 'unsupported');--> statement-breakpoint
CREATE TYPE "public"."link_basis" AS ENUM('domain_match', 'identifier_match', 'name_match', 'human');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'retrieving', 'synthesising', 'complete', 'failed', 'insufficient_evidence');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('web', 'search', 'filing', 'manual');--> statement-breakpoint
CREATE TABLE "audit_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"question" text NOT NULL,
	"areas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"model" text,
	"retrieval_strategy" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"cost_micros" integer,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chunk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"ord" integer NOT NULL,
	"heading_path" text,
	"text" text NOT NULL,
	"token_len" integer,
	"embedding" vector(384),
	"tsv" "tsvector"
);
--> statement-breakpoint
CREATE TABLE "document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"url" text NOT NULL,
	"url_hash" text NOT NULL,
	"title" text,
	"author" text,
	"published_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"http_status" integer,
	"lang" text,
	"content_hash" text,
	"extractor" text,
	"text" text,
	"byte_len" integer,
	"meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"finding_id" uuid NOT NULL,
	"verdict" "feedback_verdict" NOT NULL,
	"note" text,
	"author" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_run_id" uuid NOT NULL,
	"area" "diagnostic_area" NOT NULL,
	"outcome" "diagnostic_outcome" NOT NULL,
	"statement" text NOT NULL,
	"basis" "finding_basis" NOT NULL,
	"inference" text,
	"confidence" real,
	"ord" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finding_citation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"finding_id" uuid NOT NULL,
	"chunk_id" uuid,
	"quote" text NOT NULL,
	"url" text NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retrieval" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_run_id" uuid NOT NULL,
	"chunk_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"score_vector" real,
	"score_lexical" real,
	"score_fused" real,
	"used_in_prompt" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "source_kind" NOT NULL,
	"origin" text NOT NULL,
	"label" text,
	"trust" real DEFAULT 0.5 NOT NULL,
	"robots_allowed" integer,
	"robots_checked_at" timestamp with time zone,
	"last_crawled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subject" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"country" text,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subject_document" (
	"subject_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"basis" "link_basis" NOT NULL,
	"confidence" real DEFAULT 0.5 NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subject_identifier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_run" ADD CONSTRAINT "audit_run_subject_id_subject_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subject"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunk" ADD CONSTRAINT "chunk_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_finding_id_finding_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."finding"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding" ADD CONSTRAINT "finding_audit_run_id_audit_run_id_fk" FOREIGN KEY ("audit_run_id") REFERENCES "public"."audit_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_citation" ADD CONSTRAINT "finding_citation_finding_id_finding_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."finding"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_citation" ADD CONSTRAINT "finding_citation_chunk_id_chunk_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."chunk"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval" ADD CONSTRAINT "retrieval_audit_run_id_audit_run_id_fk" FOREIGN KEY ("audit_run_id") REFERENCES "public"."audit_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval" ADD CONSTRAINT "retrieval_chunk_id_chunk_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."chunk"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_document" ADD CONSTRAINT "subject_document_subject_id_subject_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subject"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_document" ADD CONSTRAINT "subject_document_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_identifier" ADD CONSTRAINT "subject_identifier_subject_id_subject_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subject"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_run_subject_idx" ON "audit_run" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "audit_run_status_idx" ON "audit_run" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "chunk_doc_ord_key" ON "chunk" USING btree ("document_id","ord");--> statement-breakpoint
CREATE INDEX "chunk_document_idx" ON "chunk" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_url_hash_key" ON "document" USING btree ("url_hash");--> statement-breakpoint
CREATE INDEX "document_source_idx" ON "document" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "document_fetched_idx" ON "document" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX "feedback_finding_idx" ON "feedback" USING btree ("finding_id");--> statement-breakpoint
CREATE INDEX "finding_run_idx" ON "finding" USING btree ("audit_run_id");--> statement-breakpoint
CREATE INDEX "finding_area_idx" ON "finding" USING btree ("area");--> statement-breakpoint
CREATE INDEX "finding_citation_finding_idx" ON "finding_citation" USING btree ("finding_id");--> statement-breakpoint
CREATE UNIQUE INDEX "retrieval_run_chunk_key" ON "retrieval" USING btree ("audit_run_id","chunk_id");--> statement-breakpoint
CREATE INDEX "retrieval_run_idx" ON "retrieval" USING btree ("audit_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_origin_key" ON "source" USING btree ("origin");--> statement-breakpoint
CREATE INDEX "subject_domain_idx" ON "subject" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "subject_name_idx" ON "subject" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "subject_document_key" ON "subject_document" USING btree ("subject_id","document_id");--> statement-breakpoint
CREATE INDEX "subject_document_subject_idx" ON "subject_document" USING btree ("subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subject_identifier_key" ON "subject_identifier" USING btree ("kind","value");