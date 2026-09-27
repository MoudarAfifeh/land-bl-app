CREATE TABLE `counters` (
	`vessel_id` integer PRIMARY KEY NOT NULL,
	`last_number` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`vessel_id`) REFERENCES `vessels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vessel_id` integer NOT NULL,
	`number` integer NOT NULL,
	`serial_no` text NOT NULL,
	`issue_date` text NOT NULL,
	`shipper_name` text NOT NULL,
	`shipper_address` text,
	`consignee_name` text NOT NULL,
	`consignee_address` text,
	`product` text,
	`qty_natural_l` real,
	`qty_standard_l` real,
	`weight_kg` real,
	`barrels` real,
	`seals` text DEFAULT '[]' NOT NULL,
	`density15` real,
	`octane` real,
	`flash_point` real,
	`temperature` real,
	`vcf` real,
	`meter_factor` real,
	`crossing_no` text,
	`supply_officer_name` text,
	`supply_officer_title` text,
	`mission_no` text,
	`supply_order_no` text,
	`supply_order_date` text,
	`tanker_no` text NOT NULL,
	`driver_name` text NOT NULL,
	`passport_no` text,
	`carrier_rep` text,
	`transport_date` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`vessel_id`) REFERENCES `vessels`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "documents_number_positive" CHECK("documents"."number" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documents_vessel_number_unique` ON `documents` (`vessel_id`,`number`);--> statement-breakpoint
CREATE INDEX `documents_serial_no_idx` ON `documents` (`serial_no`);--> statement-breakpoint
CREATE INDEX `documents_issue_date_idx` ON `documents` (`issue_date`);--> statement-breakpoint
CREATE TABLE `drivers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`passport_no` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `parties` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `parties_name_unique` ON `parties` (`name`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tankers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tanker_no` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tankers_tanker_no_unique` ON `tankers` (`tanker_no`);--> statement-breakpoint
CREATE TABLE `vessels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`arrival_date` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "vessels_prefix_letter" CHECK("vessels"."prefix" GLOB '[A-Z]' AND length("vessels"."prefix") = 1)
);
