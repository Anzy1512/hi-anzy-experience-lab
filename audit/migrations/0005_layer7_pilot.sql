CREATE TYPE "public"."place_precision" AS ENUM('POINT', 'BUILDING', 'STREET', 'POSTAL', 'AREA', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."place_provider" AS ENUM('nominatim', 'none');--> statement-breakpoint
CREATE TYPE "public"."citation_validity" AS ENUM('VALID', 'PARTIAL', 'INVALID', 'NO_CITATION');--> statement-breakpoint
CREATE TYPE "public"."recommendation_review" AS ENUM('ACTIONABLE', 'GENERIC', 'WRONG', 'NOT_APPLICABLE');--> statement-breakpoint
CREATE TYPE "public"."resolution_review" AS ENUM('CORRECT', 'FALSE_MERGE', 'MISSED_MERGE', 'CORRECTLY_AMBIGUOUS', 'NOT_APPLICABLE');--> statement-breakpoint
CREATE TYPE "public"."review_grade" AS ENUM('GOOD', 'PARTIAL', 'POOR');--> statement-breakpoint
CREATE TYPE "public"."review_verdict" AS ENUM('SUPPORTED', 'PARTIALLY_SUPPORTED', 'UNSUPPORTED', 'INCORRECT', 'STALE', 'AMBIGUOUS');--> statement-breakpoint
CREATE TYPE "public"."pilot_state" AS ENUM('DRAFT', 'DISCOVERING', 'RESEARCHING', 'COMPLETE', 'PARTIAL', 'BLOCKED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."place_use" AS ENUM('SUBJECT', 'OUT_OF_RADIUS', 'NO_WEBSITE', 'DUPLICATE_SITE', 'NOT_A_BUSINESS', 'OVER_BUDGET');--> statement-breakpoint
CREATE TABLE "live_model_call" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"purpose" text NOT NULL,
	"tokens_in" integer,
	"tokens_out" integer,
	"cost_micros" integer,
	"latency_ms" integer,
	"ok" integer NOT NULL,
	"detail" text,
	"called_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pilot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"spec" jsonb NOT NULL,
	"state" "pilot_state" DEFAULT 'DRAFT' NOT NULL,
	"detail" text,
	"project_id" text,
	"job_id" uuid,
	"place_provider" "place_provider",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "place_observation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pilot_id" uuid,
	"provider" "place_provider" NOT NULL,
	"external_id" text NOT NULL,
	"query" text NOT NULL,
	"name" text,
	"category" text,
	"latitude" real,
	"longitude" real,
	"precision" "place_precision" DEFAULT 'UNKNOWN' NOT NULL,
	"distance_km" real,
	"website_candidate" text,
	"address" text,
	"confidence" real,
	"use" "place_use" NOT NULL,
	"entity_id" uuid,
	"raw" jsonb,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entity_location" ADD COLUMN "geocode_precision" "place_precision";--> statement-breakpoint
ALTER TABLE "entity_location" ADD COLUMN "geocode_query" text;--> statement-breakpoint
ALTER TABLE "entity_location" ADD COLUMN "geocode_matched" text;--> statement-breakpoint
ALTER TABLE "entity_location" ADD COLUMN "geocode_external_id" text;--> statement-breakpoint
ALTER TABLE "entity_location" ADD COLUMN "geocoded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "verification_feedback" ADD COLUMN "verdict" "review_verdict";--> statement-breakpoint
ALTER TABLE "verification_feedback" ADD COLUMN "retrieval_quality" "review_grade";--> statement-breakpoint
ALTER TABLE "verification_feedback" ADD COLUMN "citation_validity" "citation_validity";--> statement-breakpoint
ALTER TABLE "verification_feedback" ADD COLUMN "entity_resolution" "resolution_review";--> statement-breakpoint
ALTER TABLE "verification_feedback" ADD COLUMN "recommendation_quality" "recommendation_review";--> statement-breakpoint
ALTER TABLE "verification_feedback" ADD COLUMN "source_coverage_note" text;--> statement-breakpoint
ALTER TABLE "verification_feedback" ADD COLUMN "correction" text;--> statement-breakpoint
ALTER TABLE "verification_feedback" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "verification_feedback" ADD COLUMN "rule_set_version" text;--> statement-breakpoint
ALTER TABLE "verification_feedback" ADD COLUMN "orchestrator_version" text;--> statement-breakpoint
ALTER TABLE "verification_feedback" ADD COLUMN "engine_version" text;--> statement-breakpoint
ALTER TABLE "verification_feedback" ADD COLUMN "model_used" text;--> statement-breakpoint
ALTER TABLE "pilot" ADD CONSTRAINT "pilot_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_observation" ADD CONSTRAINT "place_observation_pilot_id_pilot_id_fk" FOREIGN KEY ("pilot_id") REFERENCES "public"."pilot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_observation" ADD CONSTRAINT "place_observation_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "live_model_call_at_idx" ON "live_model_call" USING btree ("called_at");--> statement-breakpoint
CREATE INDEX "pilot_project_idx" ON "pilot" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "pilot_job_idx" ON "pilot" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "place_observation_pilot_idx" ON "place_observation" USING btree ("pilot_id");--> statement-breakpoint
CREATE INDEX "place_observation_entity_idx" ON "place_observation" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "place_observation_external_idx" ON "place_observation" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "verification_feedback_verdict_idx" ON "verification_feedback" USING btree ("verdict");