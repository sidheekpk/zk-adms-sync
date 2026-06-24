CREATE TYPE "public"."command_status" AS ENUM('pending', 'sent', 'success', 'failed', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."device_status" AS ENUM('online', 'offline', 'disabled', 'never_seen');--> statement-breakpoint
CREATE TYPE "public"."firmware_family" AS ENUM('speedface', 'biotime', 'iface', 'green_label', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."punch_type" AS ENUM('in', 'out', 'break_out', 'break_in', 'overtime_in', 'overtime_out', 'other');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('pending', 'synced', 'failed', 'dlq');--> statement-breakpoint
CREATE TYPE "public"."verify_mode" AS ENUM('password', 'fingerprint', 'card', 'face', 'palm', 'multi', 'other');--> statement-breakpoint
CREATE TABLE "attendance_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"device_sn" varchar(64) NOT NULL,
	"employee_id" uuid,
	"pin" varchar(32) NOT NULL,
	"punch_time" timestamp with time zone NOT NULL,
	"status_code" smallint NOT NULL,
	"punch_type" "punch_type" DEFAULT 'in' NOT NULL,
	"verify_mode_code" smallint NOT NULL,
	"verify_mode" "verify_mode" DEFAULT 'other' NOT NULL,
	"work_code" text DEFAULT '0' NOT NULL,
	"temperature" numeric(4, 1),
	"raw_data" text,
	"source_ip" text,
	"sync_status" "sync_status" DEFAULT 'pending' NOT NULL,
	"sync_attempts" integer DEFAULT 0 NOT NULL,
	"last_sync_error" text,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" text,
	"actor_email" text,
	"action" varchar(128) NOT NULL,
	"target_type" varchar(64),
	"target_id" text,
	"diff" jsonb,
	"metadata" jsonb,
	"ip_address" text,
	"user_agent" text,
	"result" varchar(16) DEFAULT 'ok' NOT NULL,
	"error_message" text,
	"reason" text,
	"operator_password_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "biometric_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"bio_type" varchar(16) NOT NULL,
	"fid" smallint DEFAULT 0 NOT NULL,
	"size" integer,
	"valid" boolean DEFAULT true NOT NULL,
	"template" text,
	"source_device_sn" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_certs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid,
	"intended_device_sn" varchar(64),
	"serial_number" text NOT NULL,
	"fingerprint" text NOT NULL,
	"pem" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text
);
--> statement-breakpoint
CREATE TABLE "device_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"command_id" integer NOT NULL,
	"command" text NOT NULL,
	"command_type" varchar(64) NOT NULL,
	"status" "command_status" DEFAULT 'pending' NOT NULL,
	"return_code" integer,
	"response_data" text,
	"issued_by_user_id" text,
	"issued_by_email" text,
	"reason" text,
	"sent_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"serial_number" varchar(64) NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"location_id" uuid,
	"model" text,
	"firmware_version" text,
	"firmware_family" "firmware_family" DEFAULT 'unknown' NOT NULL,
	"push_version" text,
	"device_type" text,
	"platform" text,
	"ip_address" text,
	"mac_address" text,
	"timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
	"timezone_synced_at" timestamp with time zone,
	"user_count" integer,
	"finger_count" integer,
	"face_count" integer,
	"palm_count" integer,
	"att_log_count" integer,
	"status" "device_status" DEFAULT 'never_seen' NOT NULL,
	"last_online" timestamp with time zone,
	"heartbeat_interval_sec" integer DEFAULT 10 NOT NULL,
	"last_stamp" text DEFAULT '0' NOT NULL,
	"last_op_stamp" text DEFAULT '0' NOT NULL,
	"cert_fingerprint" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"has_thermal" boolean DEFAULT false NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"pushed_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pin" varchar(32) NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"role" varchar(32) DEFAULT 'staff' NOT NULL,
	"device_privilege" smallint DEFAULT 0 NOT NULL,
	"card_number" text,
	"password" text,
	"group_id" integer DEFAULT 1 NOT NULL,
	"photo_url" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"biometric_flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"timezone" varchar(64),
	"latitude" numeric(10, 6),
	"longitude" numeric(10, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operator_password" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"password_hash" text NOT NULL,
	"updated_by_user_id" text,
	"updated_by_email" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sync_target_id" uuid NOT NULL,
	"batch_id" text NOT NULL,
	"record_count" integer DEFAULT 0 NOT NULL,
	"status" varchar(16) NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"http_status" integer,
	"request_payload" jsonb,
	"response_body" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" varchar(32) DEFAULT 'radixhr' NOT NULL,
	"endpoint" text NOT NULL,
	"workspace_id" text,
	"api_token_encrypted" text NOT NULL,
	"timezone_offset_minutes" integer DEFAULT 0 NOT NULL,
	"retry_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_success_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biometric_templates" ADD CONSTRAINT "biometric_templates_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_certs" ADD CONSTRAINT "device_certs_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_commands" ADD CONSTRAINT "device_commands_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_devices" ADD CONSTRAINT "employee_devices_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_devices" ADD CONSTRAINT "employee_devices_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_log" ADD CONSTRAINT "sync_log_sync_target_id_sync_targets_id_fk" FOREIGN KEY ("sync_target_id") REFERENCES "public"."sync_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_unique_idx" ON "attendance_logs" USING btree ("device_sn","pin","punch_time");--> statement-breakpoint
CREATE INDEX "attendance_time_idx" ON "attendance_logs" USING btree ("punch_time");--> statement-breakpoint
CREATE INDEX "attendance_sync_idx" ON "attendance_logs" USING btree ("sync_status");--> statement-breakpoint
CREATE INDEX "attendance_device_pin_idx" ON "attendance_logs" USING btree ("device_id","pin");--> statement-breakpoint
CREATE INDEX "tenant_audit_actor_idx" ON "audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "tenant_audit_action_idx" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "tenant_audit_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "biometric_employee_idx" ON "biometric_templates" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "biometric_unique_idx" ON "biometric_templates" USING btree ("employee_id","bio_type","fid");--> statement-breakpoint
CREATE UNIQUE INDEX "cert_fingerprint_idx" ON "device_certs" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "cert_device_idx" ON "device_certs" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "cmd_device_idx" ON "device_commands" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "cmd_status_idx" ON "device_commands" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "cmd_device_cmdid_idx" ON "device_commands" USING btree ("device_id","command_id");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_serial_idx" ON "devices" USING btree ("serial_number");--> statement-breakpoint
CREATE INDEX "devices_status_idx" ON "devices" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_device_idx" ON "employee_devices" USING btree ("employee_id","device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_pin_idx" ON "employees" USING btree ("pin");--> statement-breakpoint
CREATE INDEX "sync_log_target_idx" ON "sync_log" USING btree ("sync_target_id");--> statement-breakpoint
CREATE INDEX "sync_log_created_idx" ON "sync_log" USING btree ("created_at");