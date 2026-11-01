CREATE TYPE "public"."default_view" AS ENUM('chords', 'lyrics');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "default_view" "default_view" DEFAULT 'chords' NOT NULL;