CREATE TABLE `world_events` (
	`owner_id` text NOT NULL,
	`revision` integer NOT NULL,
	`event_json` text NOT NULL,
	`occurred_at` text NOT NULL,
	`label` text NOT NULL,
	PRIMARY KEY(`owner_id`, `revision`)
);
--> statement-breakpoint
CREATE INDEX `world_events_owner_time` ON `world_events` (`owner_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `worlds` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`data_json` text NOT NULL,
	`revision` integer NOT NULL,
	`updated_at` text NOT NULL
);
