CREATE TYPE "public"."capability_state" AS ENUM('CONFIRMED', 'PROBABLE', 'NOT_OBSERVED', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."claim_status" AS ENUM('SOURCED', 'MEASURED', 'FACT', 'DERIVED', 'UNKNOWN', 'RECOMMENDATION');--> statement-breakpoint
CREATE TYPE "public"."entity_status" AS ENUM('ACTIVE', 'MERGED', 'RETIRED');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('ORGANIZATION', 'BRAND', 'BUSINESS_LOCATION', 'PRODUCT', 'SERVICE', 'WEBSITE', 'SOCIAL_PROFILE', 'MARKETPLACE_PROFILE', 'CONTACT_POINT', 'CATEGORY', 'GEOGRAPHIC_AREA');--> statement-breakpoint
CREATE TYPE "public"."geocode_status" AS ENUM('NO_PROVIDER', 'UNRESOLVED', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."identifier_kind" AS ENUM('domain', 'phone', 'email', 'social', 'marketplace', 'registration', 'coordinates');--> statement-breakpoint
CREATE TYPE "public"."relationship_type" AS ENUM('BRAND_OF', 'OPERATES', 'LOCATED_AT', 'HAS_WEBSITE', 'HAS_SOCIAL_PROFILE', 'HAS_CONTACT', 'OFFERS_PRODUCT', 'OFFERS_SERVICE', 'SELLS', 'SUPPLIES', 'DISTRIBUTES', 'LISTED_ON', 'BELONGS_TO_CATEGORY', 'SERVES_AREA', 'SAME_AS');--> statement-breakpoint
CREATE TYPE "public"."resolution_decision" AS ENUM('SAME_ENTITY', 'PROBABLE_SAME', 'AMBIGUOUS', 'PROBABLE_DIFFERENT', 'DIFFERENT_ENTITY');--> statement-breakpoint
CREATE TYPE "public"."temporal_status" AS ENUM('CURRENT', 'HISTORICAL', 'CONFLICTING', 'UNKNOWN');--> statement-breakpoint
CREATE TABLE "capability_probe" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"document_id" uuid,
	"probed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capability_signal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"signal" text NOT NULL,
	"weight" real DEFAULT 1 NOT NULL,
	"observation_id" uuid,
	"document_id" uuid,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"parent_id" uuid
);
--> statement-breakpoint
CREATE TABLE "category_alias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"provenance" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"field" text NOT NULL,
	"value" text NOT NULL,
	"normalized_value" text,
	"status" "claim_status" NOT NULL,
	"temporal" "temporal_status" DEFAULT 'UNKNOWN' NOT NULL,
	"source_count" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"derivation" text
);
--> statement-breakpoint
CREATE TABLE "claim_observation" (
	"claim_id" uuid NOT NULL,
	"observation_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "entity_type" NOT NULL,
	"canonical_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"status" "entity_status" DEFAULT 'ACTIVE' NOT NULL,
	"merged_into" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_category" (
	"entity_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"source_value" text NOT NULL,
	"status" "claim_status" DEFAULT 'SOURCED' NOT NULL,
	"observation_id" uuid
);
--> statement-breakpoint
CREATE TABLE "entity_identifier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"kind" "identifier_kind" NOT NULL,
	"value" text NOT NULL,
	"raw_value" text,
	"verified" integer DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_location" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"address_raw" text,
	"address_normalized" text,
	"locality" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"country" text,
	"latitude" double precision,
	"longitude" double precision,
	"geocode" "geocode_status" DEFAULT 'NO_PROVIDER' NOT NULL,
	"geocode_provider" text,
	"geo_cell" text,
	"observation_id" uuid,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_merge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"surviving_id" uuid NOT NULL,
	"merged_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"rule" text NOT NULL,
	"rule_version" text NOT NULL,
	"judgement_id" uuid,
	"moved" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"merged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"undone_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "observation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"entity_id" uuid,
	"field" text NOT NULL,
	"raw_value" text NOT NULL,
	"normalized_value" text,
	"extraction_method" text NOT NULL,
	"confidence" real DEFAULT 0.5 NOT NULL,
	"chunk_id" uuid,
	"char_start" integer,
	"char_end" integer,
	"evidence" text,
	"document_version" integer,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relationship" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_entity_id" uuid NOT NULL,
	"to_entity_id" uuid NOT NULL,
	"type" "relationship_type" NOT NULL,
	"status" "claim_status" DEFAULT 'SOURCED' NOT NULL,
	"temporal" "temporal_status" DEFAULT 'UNKNOWN' NOT NULL,
	"source_count" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relationship_evidence" (
	"relationship_id" uuid NOT NULL,
	"observation_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resolution_judgement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_a_id" uuid NOT NULL,
	"entity_b_id" uuid NOT NULL,
	"decision" "resolution_decision" NOT NULL,
	"rule" text NOT NULL,
	"rule_version" text NOT NULL,
	"reason" text NOT NULL,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"human_verdict" "resolution_decision",
	"human_note" text,
	"human_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "capability_probe" ADD CONSTRAINT "capability_probe_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capability_probe" ADD CONSTRAINT "capability_probe_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capability_signal" ADD CONSTRAINT "capability_signal_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capability_signal" ADD CONSTRAINT "capability_signal_observation_id_observation_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capability_signal" ADD CONSTRAINT "capability_signal_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_alias" ADD CONSTRAINT "category_alias_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim" ADD CONSTRAINT "claim_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_observation" ADD CONSTRAINT "claim_observation_claim_id_claim_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claim"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_observation" ADD CONSTRAINT "claim_observation_observation_id_observation_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_category" ADD CONSTRAINT "entity_category_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_category" ADD CONSTRAINT "entity_category_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_category" ADD CONSTRAINT "entity_category_observation_id_observation_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_identifier" ADD CONSTRAINT "entity_identifier_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_location" ADD CONSTRAINT "entity_location_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_location" ADD CONSTRAINT "entity_location_observation_id_observation_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_merge" ADD CONSTRAINT "entity_merge_surviving_id_entity_id_fk" FOREIGN KEY ("surviving_id") REFERENCES "public"."entity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_merge" ADD CONSTRAINT "entity_merge_merged_id_entity_id_fk" FOREIGN KEY ("merged_id") REFERENCES "public"."entity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_merge" ADD CONSTRAINT "entity_merge_judgement_id_resolution_judgement_id_fk" FOREIGN KEY ("judgement_id") REFERENCES "public"."resolution_judgement"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation" ADD CONSTRAINT "observation_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation" ADD CONSTRAINT "observation_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation" ADD CONSTRAINT "observation_chunk_id_chunk_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."chunk"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship" ADD CONSTRAINT "relationship_from_entity_id_entity_id_fk" FOREIGN KEY ("from_entity_id") REFERENCES "public"."entity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship" ADD CONSTRAINT "relationship_to_entity_id_entity_id_fk" FOREIGN KEY ("to_entity_id") REFERENCES "public"."entity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_evidence" ADD CONSTRAINT "relationship_evidence_relationship_id_relationship_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationship"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_evidence" ADD CONSTRAINT "relationship_evidence_observation_id_observation_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_judgement" ADD CONSTRAINT "resolution_judgement_entity_a_id_entity_id_fk" FOREIGN KEY ("entity_a_id") REFERENCES "public"."entity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_judgement" ADD CONSTRAINT "resolution_judgement_entity_b_id_entity_id_fk" FOREIGN KEY ("entity_b_id") REFERENCES "public"."entity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "capability_probe_key" ON "capability_probe" USING btree ("entity_id","capability","document_id");--> statement-breakpoint
CREATE INDEX "capability_probe_entity_idx" ON "capability_probe" USING btree ("entity_id","capability");--> statement-breakpoint
CREATE UNIQUE INDEX "capability_signal_key" ON "capability_signal" USING btree ("entity_id","capability","signal","document_id");--> statement-breakpoint
CREATE INDEX "capability_signal_entity_idx" ON "capability_signal" USING btree ("entity_id","capability");--> statement-breakpoint
CREATE UNIQUE INDEX "category_slug_key" ON "category" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "category_alias_key" ON "category_alias" USING btree ("alias");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_key" ON "claim" USING btree ("entity_id","field","value");--> statement-breakpoint
CREATE INDEX "claim_entity_field_idx" ON "claim" USING btree ("entity_id","field");--> statement-breakpoint
CREATE INDEX "claim_normalized_idx" ON "claim" USING btree ("field","normalized_value");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_observation_key" ON "claim_observation" USING btree ("claim_id","observation_id");--> statement-breakpoint
CREATE INDEX "claim_observation_obs_idx" ON "claim_observation" USING btree ("observation_id");--> statement-breakpoint
CREATE INDEX "entity_normalized_name_idx" ON "entity" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "entity_type_idx" ON "entity" USING btree ("type");--> statement-breakpoint
CREATE INDEX "entity_status_idx" ON "entity" USING btree ("status");--> statement-breakpoint
CREATE INDEX "entity_merged_into_idx" ON "entity" USING btree ("merged_into");--> statement-breakpoint
CREATE UNIQUE INDEX "entity_category_key" ON "entity_category" USING btree ("entity_id","category_id","source_value");--> statement-breakpoint
CREATE INDEX "entity_category_category_idx" ON "entity_category" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entity_identifier_key" ON "entity_identifier" USING btree ("entity_id","kind","value");--> statement-breakpoint
CREATE INDEX "entity_identifier_lookup_idx" ON "entity_identifier" USING btree ("kind","value");--> statement-breakpoint
CREATE INDEX "entity_location_entity_idx" ON "entity_location" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "entity_location_cell_idx" ON "entity_location" USING btree ("geo_cell");--> statement-breakpoint
CREATE INDEX "entity_location_postal_idx" ON "entity_location" USING btree ("postal_code");--> statement-breakpoint
CREATE INDEX "entity_location_city_idx" ON "entity_location" USING btree ("city");--> statement-breakpoint
CREATE INDEX "entity_merge_surviving_idx" ON "entity_merge" USING btree ("surviving_id");--> statement-breakpoint
CREATE INDEX "entity_merge_merged_idx" ON "entity_merge" USING btree ("merged_id");--> statement-breakpoint
CREATE UNIQUE INDEX "observation_key" ON "observation" USING btree ("document_id","field","raw_value","extraction_method","document_version");--> statement-breakpoint
CREATE INDEX "observation_entity_idx" ON "observation" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "observation_field_idx" ON "observation" USING btree ("field");--> statement-breakpoint
CREATE INDEX "observation_normalized_idx" ON "observation" USING btree ("field","normalized_value");--> statement-breakpoint
CREATE INDEX "observation_document_idx" ON "observation" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "relationship_key" ON "relationship" USING btree ("from_entity_id","to_entity_id","type");--> statement-breakpoint
CREATE INDEX "relationship_from_idx" ON "relationship" USING btree ("from_entity_id","type");--> statement-breakpoint
CREATE INDEX "relationship_to_idx" ON "relationship" USING btree ("to_entity_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "relationship_evidence_key" ON "relationship_evidence" USING btree ("relationship_id","observation_id");--> statement-breakpoint
CREATE INDEX "relationship_evidence_obs_idx" ON "relationship_evidence" USING btree ("observation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resolution_judgement_pair_key" ON "resolution_judgement" USING btree ("entity_a_id","entity_b_id");--> statement-breakpoint
CREATE INDEX "resolution_judgement_decision_idx" ON "resolution_judgement" USING btree ("decision");--> statement-breakpoint
CREATE INDEX "resolution_judgement_a_idx" ON "resolution_judgement" USING btree ("entity_a_id");--> statement-breakpoint
CREATE INDEX "resolution_judgement_b_idx" ON "resolution_judgement" USING btree ("entity_b_id");