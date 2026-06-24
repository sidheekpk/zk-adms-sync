CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`description` text,
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `attendance_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` integer NOT NULL,
	`device_sn` text NOT NULL,
	`pin` text NOT NULL,
	`timestamp` text NOT NULL,
	`status` integer NOT NULL,
	`verify_mode` integer NOT NULL,
	`work_code` text DEFAULT '0',
	`raw_data` text,
	`source_ip` text,
	`sync_status` text DEFAULT 'pending',
	`sync_attempts` integer DEFAULT 0,
	`last_sync_error` text,
	`synced_at` text,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_unique_punch` ON `attendance_logs` (`device_sn`,`pin`,`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_timestamp` ON `attendance_logs` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_sync_status` ON `attendance_logs` (`sync_status`);--> statement-breakpoint
CREATE INDEX `idx_device_pin` ON `attendance_logs` (`device_id`,`pin`);--> statement-breakpoint
CREATE TABLE `device_commands` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` integer NOT NULL,
	`command_id` integer NOT NULL,
	`command` text NOT NULL,
	`command_type` text NOT NULL,
	`status` text DEFAULT 'pending',
	`return_code` integer,
	`response_data` text,
	`sent_at` text,
	`completed_at` text,
	`expires_at` text,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `device_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` integer NOT NULL,
	`pin` text NOT NULL,
	`name` text,
	`privilege` integer DEFAULT 0,
	`card_number` text,
	`password` text,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_device_user` ON `device_users` (`device_id`,`pin`);--> statement-breakpoint
CREATE TABLE `devices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`serial_number` text NOT NULL,
	`name` text DEFAULT '',
	`model` text,
	`firmware_version` text,
	`ip_address` text,
	`mac_address` text,
	`push_version` text,
	`device_type` text,
	`platform` text,
	`user_count` integer,
	`att_log_count` integer,
	`last_online` text,
	`is_online` integer DEFAULT false,
	`last_stamp` text DEFAULT '0',
	`last_op_stamp` text DEFAULT '0',
	`location_id` integer,
	`heartbeat_interval` integer DEFAULT 30,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_serial_number_unique` ON `devices` (`serial_number`);--> statement-breakpoint
CREATE TABLE `locations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`timezone` text DEFAULT 'Asia/Dubai',
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `sync_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sync_target_id` integer NOT NULL,
	`record_count` integer NOT NULL,
	`status` text NOT NULL,
	`http_status` integer,
	`response_body` text,
	`error_message` text,
	`duration_ms` integer,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`sync_target_id`) REFERENCES `sync_targets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sync_targets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'webhook' NOT NULL,
	`url` text NOT NULL,
	`method` text DEFAULT 'POST',
	`headers` text DEFAULT '{}',
	`auth_type` text DEFAULT 'none',
	`auth_value` text,
	`payload_template` text,
	`is_active` integer DEFAULT true,
	`retry_attempts` integer DEFAULT 3,
	`retry_delay_ms` integer DEFAULT 5000,
	`batch_size` integer DEFAULT 50,
	`last_sync_at` text,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
