CREATE TABLE IF NOT EXISTS `players` (
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
CREATE TABLE IF NOT EXISTS `rooms` (
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


CREATE INDEX IF NOT EXISTS players_room ON players(room);
CREATE INDEX IF NOT EXISTS players_room_token ON players(room,token);
CREATE INDEX IF NOT EXISTS rooms_expires ON rooms(expires);
CREATE TABLE IF NOT EXISTS audio_chunks(key TEXT NOT NULL,part INTEGER NOT NULL,version TEXT NOT NULL,data BLOB NOT NULL,expires INTEGER NOT NULL,PRIMARY KEY(key,part));
CREATE INDEX IF NOT EXISTS audio_expires ON audio_chunks(expires);
