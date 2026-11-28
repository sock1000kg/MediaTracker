-- Log entries: dates and progress move from UserLogs onto LogEntry (one log per item, many dated entries).
-- Idempotent: the data move only runs while the old columns exist.

-- AlterTable
ALTER TABLE "UserLogs" ADD COLUMN IF NOT EXISTS "title" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "LogEntry" (
    "id" UUID NOT NULL,
    "logId" UUID NOT NULL,
    "startedAt" DATE,
    "finishedAt" DATE,
    "progressEpisodes" INTEGER,
    "progressChapters" INTEGER,
    "progressVolumes" INTEGER,
    "note" TEXT,
    "edition" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LogEntry_logId_finishedAt_idx" ON "LogEntry"("logId", "finishedAt");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "LogEntry" ADD CONSTRAINT "LogEntry_logId_fkey" FOREIGN KEY ("logId") REFERENCES "UserLogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Move the data: a log with any date or progress becomes one entry; the rest (e.g. wishlist) get none.
DO $$
DECLARE
    total_logs INTEGER;
    created_entries INTEGER;
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'UserLogs' AND column_name = 'started_at'
    ) THEN
        SELECT COUNT(*) INTO total_logs FROM "UserLogs";

        INSERT INTO "LogEntry" ("id", "logId", "startedAt", "finishedAt", "progressEpisodes", "progressChapters", "progressVolumes", "created_at")
        SELECT gen_random_uuid(), l."id", l."started_at"::date, l."finished_at"::date,
               l."progressEpisodes", l."progressChapters", l."progressVolumes", l."logged_at"
        FROM "UserLogs" l
        WHERE l."started_at" IS NOT NULL OR l."finished_at" IS NOT NULL
           OR l."progressEpisodes" IS NOT NULL OR l."progressChapters" IS NOT NULL OR l."progressVolumes" IS NOT NULL;
        GET DIAGNOSTICS created_entries = ROW_COUNT;

        RAISE NOTICE 'log_entries migration: % logs, % entries created, % logs without entries',
            total_logs, created_entries, total_logs - created_entries;

        ALTER TABLE "UserLogs" DROP COLUMN "started_at";
        ALTER TABLE "UserLogs" DROP COLUMN "finished_at";
        ALTER TABLE "UserLogs" DROP COLUMN "progressEpisodes";
        ALTER TABLE "UserLogs" DROP COLUMN "progressChapters";
        ALTER TABLE "UserLogs" DROP COLUMN "progressVolumes";
    END IF;
END $$;

-- Goodreads rows are re-checked by the next Open Library sync, which now merges duplicate editions.
UPDATE "Media" SET "syncCheckedAt" = NULL WHERE "provider" = 'goodreads';
