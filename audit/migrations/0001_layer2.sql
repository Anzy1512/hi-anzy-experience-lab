CREATE TYPE "public"."chunk_kind" AS ENUM('section', 'paragraph', 'list', 'table', 'metadata');--> statement-breakpoint
CREATE TYPE "public"."extraction_method" AS ENUM('jsonld', 'opengraph', 'meta', 'microdata', 'dom', 'link', 'readability', 'pattern');--> statement-breakpoint
CREATE TYPE "public"."fetch_outcome" AS ENUM('ok', 'unchanged', 'blocked_robots', 'blocked_private', 'blocked_scheme', 'blocked_type', 'too_large', 'too_many_redirects', 'timeout', 'http_error', 'network_error');--> statement-breakpoint
CREATE TYPE "public"."search_provider" AS ENUM('searxng', 'brave', 'tavily', 'direct', 'sitemap');--> statement-breakpoint
CREATE TABLE "discovery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "search_provider" NOT NULL,
	"query" text NOT NULL,
	"url" text NOT NULL,
	"url_hash" text NOT NULL,
	"canonical_url" text,
	"title" text,
	"snippet" text,
	"rank" integer NOT NULL,
	"published_at" timestamp with time zone,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider_metadata" jsonb,
	"document_id" uuid,
	"outcome" "fetch_outcome"
);
--> statement-breakpoint
CREATE TABLE "document_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content_hash" text NOT NULL,
	"byte_len" integer,
	"changed_chars" integer,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extracted_field" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"field" text NOT NULL,
	"value" text NOT NULL,
	"method" "extraction_method" NOT NULL,
	"char_start" integer,
	"char_end" integer,
	"evidence" text,
	"extracted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_run" ALTER COLUMN "subject_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_run" ADD COLUMN "pipeline_version" text;--> statement-breakpoint
ALTER TABLE "audit_run" ADD COLUMN "embedding_model" text;--> statement-breakpoint
ALTER TABLE "audit_run" ADD COLUMN "budget" integer;--> statement-breakpoint
ALTER TABLE "chunk" ADD COLUMN "kind" "chunk_kind" DEFAULT 'paragraph' NOT NULL;--> statement-breakpoint
ALTER TABLE "chunk" ADD COLUMN "hash" text;--> statement-breakpoint
ALTER TABLE "chunk" ADD COLUMN "char_start" integer;--> statement-breakpoint
ALTER TABLE "chunk" ADD COLUMN "char_end" integer;--> statement-breakpoint
ALTER TABLE "chunk" ADD COLUMN "document_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "canonical_url" text;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "content_type" text;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "etag" text;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "last_modified" text;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "outcome" "fetch_outcome";--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "correction" text;--> statement-breakpoint
ALTER TABLE "discovery" ADD CONSTRAINT "discovery_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_revision" ADD CONSTRAINT "document_revision_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_field" ADD CONSTRAINT "extracted_field_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "discovery_provider_query_url_key" ON "discovery" USING btree ("provider","query","url_hash");--> statement-breakpoint
CREATE INDEX "discovery_url_idx" ON "discovery" USING btree ("url_hash");--> statement-breakpoint
CREATE INDEX "discovery_document_idx" ON "discovery" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_revision_key" ON "document_revision" USING btree ("document_id","version");--> statement-breakpoint
CREATE INDEX "document_revision_doc_idx" ON "document_revision" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "extracted_field_key" ON "extracted_field" USING btree ("document_id","field","value","method");--> statement-breakpoint
CREATE INDEX "extracted_field_doc_idx" ON "extracted_field" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "extracted_field_field_idx" ON "extracted_field" USING btree ("field");