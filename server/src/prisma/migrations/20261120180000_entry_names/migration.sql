-- Entry names: each entry has a name (what you read or watched, or any label).
-- The edition title becomes the entry name; the log's own title moves to its newest entry, then goes away.
-- Idempotent: the data moves only run while the old data is still there.

-- AlterTable
ALTER TABLE "LogEntry" ADD COLUMN IF NOT EXISTS "name" TEXT;

-- Edition titles become entry names, and leave the edition JSON
DO $$
DECLARE
    named_from_edition INTEGER;
BEGIN
    UPDATE "LogEntry"
    SET "name" = btrim("edition"->>'title')
    WHERE "name" IS NULL AND btrim(COALESCE("edition"->>'title', '')) <> '';
    GET DIAGNOSTICS named_from_edition = ROW_COUNT;

    UPDATE "LogEntry"
    SET "edition" = CASE WHEN ("edition" - 'title') = '{}'::jsonb THEN NULL ELSE ("edition" - 'title') END
    WHERE "edition" ? 'title';

    RAISE NOTICE 'entry_names migration: % entries named from edition titles', named_from_edition;
END $$;

-- The log's own title moves to its newest entry (latest finish, else start; undated last; tie by id desc)
DO $$
DECLARE
    moved INTEGER := 0;
    dropped INTEGER := 0;
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'UserLogs' AND column_name = 'title'
    ) THEN
        WITH newest AS (
            SELECT DISTINCT ON (e."logId") e."id", e."logId", e."name"
            FROM "LogEntry" e
            JOIN "UserLogs" l ON l."id" = e."logId"
            WHERE l."title" IS NOT NULL AND btrim(l."title") <> ''
            ORDER BY e."logId",
                     COALESCE(e."finishedAt", e."startedAt") DESC NULLS LAST,
                     e."id" DESC
        )
        UPDATE "LogEntry" e
        SET "name" = btrim(l."title")
        FROM newest n
        JOIN "UserLogs" l ON l."id" = n."logId"
        WHERE e."id" = n."id" AND (n."name" IS NULL OR btrim(n."name") = '');
        GET DIAGNOSTICS moved = ROW_COUNT;

        SELECT COUNT(*) INTO dropped
        FROM "UserLogs" l
        WHERE l."title" IS NOT NULL AND btrim(l."title") <> ''
          AND NOT EXISTS (SELECT 1 FROM "LogEntry" e WHERE e."logId" = l."id");

        RAISE NOTICE 'entry_names migration: % log titles moved to the newest entry, % log titles dropped (no entries)', moved, dropped;

        ALTER TABLE "UserLogs" DROP COLUMN "title";
    END IF;
END $$;
