ALTER TABLE "setlist_items" ALTER COLUMN "arrangement_id" DROP NOT NULL;--> statement-breakpoint
-- text -> text[] has no assignment cast, so USING is required. The column
-- was never written before this migration, so existing values are NULL
-- (string_to_array(NULL, ...) is NULL); the split keeps any legacy
-- comma-separated value intact.
ALTER TABLE "setlist_items" ALTER COLUMN "custom_sequence" SET DATA TYPE text[] USING string_to_array("custom_sequence", ',');
