CREATE TYPE "public"."agent_role" AS ENUM('SYSTEM', 'RESEARCHER', 'VERIFIER', 'ANALYST');--> statement-breakpoint
CREATE TYPE "public"."job_state" AS ENUM('QUEUED', 'RUNNING', 'COMPLETE', 'PARTIAL', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."task_state" AS ENUM('PENDING', 'RUNNING', 'DONE', 'FAILED', 'SKIPPED');--> statement-breakpoint
CREATE TABLE "agent_step" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"agent" "agent_role" NOT NULL,
	"turn" integer NOT NULL,
	"purpose" text NOT NULL,
	"new_observations" integer DEFAULT 0 NOT NULL,
	"new_entities" integer DEFAULT 0 NOT NULL,
	"new_findings" integer DEFAULT 0 NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"request" jsonb NOT NULL,
	"intent" text,
	"state" "job_state" DEFAULT 'QUEUED' NOT NULL,
	"termination" text,
	"project_id" text,
	"subject_entity_id" uuid,
	"model_calls" integer DEFAULT 0 NOT NULL,
	"tool_calls" integer DEFAULT 0 NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cost_micros" integer,
	"searches" integer DEFAULT 0 NOT NULL,
	"pages_crawled" integer DEFAULT 0 NOT NULL,
	"iterations" integer DEFAULT 0 NOT NULL,
	"limitations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"agent" "agent_role" DEFAULT 'SYSTEM' NOT NULL,
	"state" "task_state" DEFAULT 'PENDING' NOT NULL,
	"depends_on" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"rationale" text,
	"audit_run_id" uuid,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"ord" integer DEFAULT 0 NOT NULL,
	"created_by_task" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tool_call" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"agent" "agent_role" NOT NULL,
	"tool" text NOT NULL,
	"args" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"outcome" integer NOT NULL,
	"result" text,
	"error" text,
	"duration_ms" integer,
	"pages_crawled" integer DEFAULT 0 NOT NULL,
	"searches" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_step" ADD CONSTRAINT "agent_step_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_subject_entity_id_entity_id_fk" FOREIGN KEY ("subject_entity_id") REFERENCES "public"."entity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_audit_run_id_audit_run_id_fk" FOREIGN KEY ("audit_run_id") REFERENCES "public"."audit_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_call" ADD CONSTRAINT "tool_call_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_step_task_idx" ON "agent_step" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "job_state_idx" ON "job" USING btree ("state");--> statement-breakpoint
CREATE INDEX "job_project_idx" ON "job" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_job_key" ON "task" USING btree ("job_id","key");--> statement-breakpoint
CREATE INDEX "task_job_state_idx" ON "task" USING btree ("job_id","state");--> statement-breakpoint
CREATE INDEX "tool_call_task_idx" ON "tool_call" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "tool_call_tool_idx" ON "tool_call" USING btree ("tool");