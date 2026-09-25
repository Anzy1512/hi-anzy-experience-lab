CREATE TYPE "public"."finding_status" AS ENUM('FACT', 'DERIVED', 'UNKNOWN', 'UNSUPPORTED', 'CONFLICTING', 'RECOMMENDATION');--> statement-breakpoint
CREATE TYPE "public"."intent_kind" AS ENUM('ENTITY_LOOKUP', 'ENTITY_DISCOVERY', 'LOCAL_DISCOVERY', 'CATEGORY_DISCOVERY', 'SUPPLIER_DISCOVERY', 'RETAILER_DISCOVERY', 'COMPETITOR_DISCOVERY', 'DIGITAL_PRESENCE_AUDIT', 'ECOMMERCE_AUDIT', 'BUSINESS_AUDIT', 'MARKET_MAPPING', 'GAP_ANALYSIS', 'COMPARISON', 'EVIDENCE_CHECK', 'DATA_ENRICHMENT', 'RELATIONSHIP_DISCOVERY', 'GENERAL_RESEARCH', 'UNKNOWN_INTENT');--> statement-breakpoint
CREATE TYPE "public"."model_class" AS ENUM('NO_MODEL', 'SMALL_MODEL', 'REASONING_MODEL');--> statement-breakpoint
CREATE TYPE "public"."reasoning_type" AS ENUM('RULE', 'RETRIEVAL', 'MODEL', 'HUMAN');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('UNVERIFIED', 'VERIFIED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "evidence_selection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_run_id" uuid NOT NULL,
	"entity_id" uuid,
	"kind" text NOT NULL,
	"ref_id" uuid,
	"included" integer NOT NULL,
	"reason" text NOT NULL,
	"score" real,
	"token_len" integer
);
--> statement-breakpoint
CREATE TABLE "model_call" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_run_id" uuid,
	"purpose" text NOT NULL,
	"model_class" "model_class" NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"tokens_in" integer,
	"tokens_out" integer,
	"cost_micros" integer,
	"duration_ms" integer,
	"ok" integer DEFAULT 1 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_artifact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_run_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"limitations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"finding_id" uuid NOT NULL,
	"verifier_was_right" integer,
	"human_status" "finding_status",
	"note" text,
	"author" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finding" ALTER COLUMN "area" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "finding" ALTER COLUMN "outcome" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_run" ADD COLUMN "intent" text;--> statement-breakpoint
ALTER TABLE "audit_run" ADD COLUMN "request" jsonb;--> statement-breakpoint
ALTER TABLE "audit_run" ADD COLUMN "plan" jsonb;--> statement-breakpoint
ALTER TABLE "audit_run" ADD COLUMN "model_calls" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "finding" ADD COLUMN "entity_id" uuid;--> statement-breakpoint
ALTER TABLE "finding" ADD COLUMN "finding_type" text;--> statement-breakpoint
ALTER TABLE "finding" ADD COLUMN "status" text;--> statement-breakpoint
ALTER TABLE "finding" ADD COLUMN "reasoning_type" text;--> statement-breakpoint
ALTER TABLE "finding" ADD COLUMN "rule_id" text;--> statement-breakpoint
ALTER TABLE "finding" ADD COLUMN "rule_version" text;--> statement-breakpoint
ALTER TABLE "finding" ADD COLUMN "model_used" text;--> statement-breakpoint
ALTER TABLE "finding" ADD COLUMN "limitations" text;--> statement-breakpoint
ALTER TABLE "finding" ADD COLUMN "verification" text DEFAULT 'UNVERIFIED' NOT NULL;--> statement-breakpoint
ALTER TABLE "finding" ADD COLUMN "verification_reason" text;--> statement-breakpoint
ALTER TABLE "finding_citation" ADD COLUMN "observation_id" uuid;--> statement-breakpoint
ALTER TABLE "finding_citation" ADD COLUMN "claim_id" uuid;--> statement-breakpoint
ALTER TABLE "evidence_selection" ADD CONSTRAINT "evidence_selection_audit_run_id_audit_run_id_fk" FOREIGN KEY ("audit_run_id") REFERENCES "public"."audit_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_selection" ADD CONSTRAINT "evidence_selection_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_call" ADD CONSTRAINT "model_call_audit_run_id_audit_run_id_fk" FOREIGN KEY ("audit_run_id") REFERENCES "public"."audit_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_artifact" ADD CONSTRAINT "research_artifact_audit_run_id_audit_run_id_fk" FOREIGN KEY ("audit_run_id") REFERENCES "public"."audit_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_feedback" ADD CONSTRAINT "verification_feedback_finding_id_finding_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."finding"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_selection_run_idx" ON "evidence_selection" USING btree ("audit_run_id");--> statement-breakpoint
CREATE INDEX "evidence_selection_entity_idx" ON "evidence_selection" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "model_call_run_idx" ON "model_call" USING btree ("audit_run_id");--> statement-breakpoint
CREATE INDEX "model_call_purpose_idx" ON "model_call" USING btree ("purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "research_artifact_key" ON "research_artifact" USING btree ("audit_run_id","kind");--> statement-breakpoint
CREATE INDEX "research_artifact_run_idx" ON "research_artifact" USING btree ("audit_run_id");--> statement-breakpoint
CREATE INDEX "verification_feedback_finding_idx" ON "verification_feedback" USING btree ("finding_id");