ALTER TABLE `studio_revisions` ADD `save_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `revisions_project_save` ON `studio_revisions` (`project_id`,`save_id`);