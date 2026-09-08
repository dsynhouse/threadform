CREATE TABLE `studio_connections` (
	`owner` text PRIMARY KEY NOT NULL,
	`encrypted_token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `studio_oauth_states` (
	`state` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `oauth_expiry` ON `studio_oauth_states` (`expires_at`);--> statement-breakpoint
CREATE TABLE `studio_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`blob_key` text NOT NULL,
	`object_count` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `projects_owner_updated` ON `studio_projects` (`owner`,`updated_at`);--> statement-breakpoint
CREATE TABLE `studio_references` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`notes` text NOT NULL,
	`tags` text NOT NULL,
	`palette` text NOT NULL,
	`image_key` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `references_owner_created` ON `studio_references` (`owner`,`created_at`);--> statement-breakpoint
CREATE TABLE `studio_revisions` (
	`project_id` text NOT NULL,
	`revision` integer NOT NULL,
	`blob_key` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`project_id`, `revision`),
	FOREIGN KEY (`project_id`) REFERENCES `studio_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
