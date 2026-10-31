-- default_sequence: text -> text[] (issue #9). Postgres has no text -> text[]
-- cast, so the USING clause is mandatory; '{}' is correct because the table
-- is empty pre-alpha (no rows exist to convert).
ALTER TABLE "arrangements" ALTER COLUMN "default_sequence" SET DATA TYPE text[] USING '{}'::text[];