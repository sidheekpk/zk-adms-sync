CREATE SCHEMA "platform";
--> statement-breakpoint
CREATE TYPE "platform"."isolation_mode" AS ENUM('schema', 'dedicated_db');--> statement-breakpoint
CREATE TYPE "platform"."tenant_status" AS ENUM('active', 'suspended', 'pending_setup', 'archived');--> statement-breakpoint
CREATE TYPE "platform"."user_role" AS ENUM('super_admin', 'ops', 'tenant_admin', 'operator', 'read_only');--> statement-breakpoint
CREATE TABLE "platform"."account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform"."device_enrollment_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"token" text NOT NULL,
	"issued_by_user_id" text,
	"intended_device_name" text,
	"intended_device_model" text,
	"consumed_at" timestamp with time zone,
	"consumed_by_sn" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform"."audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" text,
	"actor_email" text,
	"tenant_id" uuid,
	"action" varchar(128) NOT NULL,
	"target_type" varchar(64),
	"target_id" text,
	"diff" jsonb,
	"metadata" jsonb,
	"ip_address" text,
	"user_agent" text,
	"result" varchar(16) DEFAULT 'ok' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform"."security_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" varchar(64) NOT NULL,
	"severity" varchar(16) DEFAULT 'info' NOT NULL,
	"subject_email" text,
	"subject_user_id" text,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform"."session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"active_tenant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform"."tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"schema_name" varchar(63) NOT NULL,
	"isolation_mode" "platform"."isolation_mode" DEFAULT 'schema' NOT NULL,
	"dedicated_db_url" text,
	"status" "platform"."tenant_status" DEFAULT 'pending_setup' NOT NULL,
	"timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
	"brand_color" varchar(16),
	"logo_url" text,
	"radixhr_workspace_id" text,
	"radixhr_endpoint" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform"."two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform"."user" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"is_super_admin" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform"."user_tenant_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"tenant_id" uuid,
	"role" "platform"."user_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform"."verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform"."account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "platform"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."device_enrollment_tokens" ADD CONSTRAINT "device_enrollment_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "platform"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."device_enrollment_tokens" ADD CONSTRAINT "device_enrollment_tokens_issued_by_user_id_user_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "platform"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."audit_log" ADD CONSTRAINT "audit_log_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "platform"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "platform"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "platform"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."user_tenant_roles" ADD CONSTRAINT "user_tenant_roles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "platform"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."user_tenant_roles" ADD CONSTRAINT "user_tenant_roles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "platform"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "enroll_token_idx" ON "platform"."device_enrollment_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "enroll_tenant_idx" ON "platform"."device_enrollment_tokens" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "platform"."audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_tenant_idx" ON "platform"."audit_log" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "platform"."audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "platform"."audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sec_events_kind_idx" ON "platform"."security_events" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "sec_events_created_idx" ON "platform"."security_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_idx" ON "platform"."session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "platform"."session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_slug_idx" ON "platform"."tenants" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_schema_name_idx" ON "platform"."tenants" USING btree ("schema_name");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_idx" ON "platform"."user" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "user_tenant_role_idx" ON "platform"."user_tenant_roles" USING btree ("user_id","tenant_id","role");--> statement-breakpoint
CREATE INDEX "user_tenant_user_idx" ON "platform"."user_tenant_roles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_tenant_tenant_idx" ON "platform"."user_tenant_roles" USING btree ("tenant_id");