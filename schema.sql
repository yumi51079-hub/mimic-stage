CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`room` text NOT NULL,
	`token` text NOT NULL,
	`name` text NOT NULL,
	`joined` integer NOT NULL,
	`seen` integer NOT NULL,
	`ready` integer DEFAULT 0 NOT NULL,
	`score` integer,
	`pitch` integer,
	`rhythm` integer,
	`audio` integer DEFAULT 0 NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`duration` integer DEFAULT 0 NOT NULL,
	`has_clip` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`host` text NOT NULL,
	`expires` integer NOT NULL,
	`phase` text DEFAULT 'setup' NOT NULL,
	`round` integer DEFAULT 0 NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`duration` integer DEFAULT 0 NOT NULL,
	`start_at` integer DEFAULT 0 NOT NULL,
	`queue` text DEFAULT '[]' NOT NULL
);
