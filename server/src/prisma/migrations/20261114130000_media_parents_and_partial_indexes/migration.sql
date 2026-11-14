-- AlterTable
ALTER TABLE "Media" ADD COLUMN "parentId" INTEGER,
ADD COLUMN "position" INTEGER;

-- CreateIndex
CREATE INDEX "Media_parentId_idx" ON "Media"("parentId");

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 1. Check for duplicates before creating unique index
DO $$
DECLARE
    dup_record RECORD;
    dup_list TEXT := '';
BEGIN
    FOR dup_record IN
        SELECT source, "sourceId", COUNT(*) as cnt
        FROM "Media"
        WHERE "sourceId" IS NOT NULL
        GROUP BY source, "sourceId"
        HAVING COUNT(*) > 1
    LOOP
        dup_list := dup_list || format('source: %s, sourceId: %s (count: %s); ', dup_record.source, dup_record."sourceId", dup_record.cnt);
    END LOOP;

    IF dup_list <> '' THEN
        RAISE EXCEPTION 'Cannot create unique index: duplicate (source, sourceId) found in Media: %', dup_list;
    END IF;
END $$;

-- 2. Season backfill: link existing seasons to their shows
DO $$
DECLARE
    sys_user_id INT;
    season_rec RECORD;
    show_id INT;
    target_tmdb_id TEXT;
    target_source_id TEXT;
    target_show_title TEXT;
BEGIN
    SELECT id INTO sys_user_id FROM "User" WHERE username = 'system' LIMIT 1;

    FOR season_rec IN
        SELECT id, "mediaTypeId", "imageUrl", metadata
        FROM "Media"
        WHERE metadata IS NOT NULL AND metadata->>'kind' = 'season' AND metadata->>'tmdbId' IS NOT NULL
    LOOP
        target_tmdb_id := season_rec.metadata->>'tmdbId';
        target_source_id := 'tv:' || target_tmdb_id;

        -- Find show Media
        SELECT id INTO show_id
        FROM "Media"
        WHERE source = 'tmdb' AND "sourceId" = target_source_id
        LIMIT 1;

        -- If not found, insert show Media
        IF show_id IS NULL THEN
            target_show_title := COALESCE(NULLIF(TRIM(season_rec.metadata->>'showTitle'), ''), 'Unknown title');
            INSERT INTO "Media" (
                title,
                "mediaTypeId",
                "imageUrl",
                source,
                "sourceId",
                metadata,
                "userId",
                created_at
            ) VALUES (
                target_show_title,
                season_rec."mediaTypeId",
                season_rec."imageUrl",
                'tmdb',
                target_source_id,
                jsonb_build_object('kind', 'show', 'tmdbId', target_tmdb_id::int),
                sys_user_id,
                now()
            )
            RETURNING id INTO show_id;
        END IF;

        -- Set season parentId and position
        UPDATE "Media"
        SET "parentId" = show_id,
            position = CASE
                WHEN (season_rec.metadata->>'seasonNumber') ~ '^[0-9]+$'
                THEN (season_rec.metadata->>'seasonNumber')::int
                ELSE position
            END
        WHERE id = season_rec.id;
    END LOOP;
END $$;

-- Drop old unique index
DROP INDEX IF EXISTS "Media_userId_creator_title_year_mediaTypeId_source_key";

-- Create new partial unique indexes
CREATE UNIQUE INDEX "Media_source_sourceId_key" ON "Media"("source", "sourceId") WHERE ("sourceId" IS NOT NULL);

CREATE UNIQUE INDEX "Media_userId_creator_title_year_mediaTypeId_source_key" ON "Media"("userId", "creator", "title", "year", "mediaTypeId", "source") WHERE ("sourceId" IS NULL);

-- AlterTable UserLogs: add progress column
ALTER TABLE "UserLogs" ADD COLUMN "progress" JSONB;

-- Data migration: copy progress keys from Media.metadata to UserLogs.progress, then remove them from Media.metadata
DO $$
DECLARE
    r RECORD;
    prog JSONB;
BEGIN
    FOR r IN
        SELECT l.id AS log_id, m.id AS media_id, m.metadata
        FROM "UserLogs" l
        JOIN "Media" m ON l."mediaId" = m.id
        WHERE m.metadata IS NOT NULL
          AND (m.metadata ? 'watchedEpisodes' OR m.metadata ? 'readChapters' OR m.metadata ? 'readVolumes')
    LOOP
        prog := jsonb_strip_nulls(jsonb_build_object(
            'watchedEpisodes', r.metadata->'watchedEpisodes',
            'readChapters', r.metadata->'readChapters',
            'readVolumes', r.metadata->'readVolumes'
        ));

        IF prog <> '{}'::jsonb THEN
            UPDATE "UserLogs"
            SET progress = COALESCE(progress, '{}'::jsonb) || prog
            WHERE id = r.log_id;
        END IF;
    END LOOP;

    -- Remove keys from Media.metadata
    UPDATE "Media"
    SET metadata = (metadata - 'watchedEpisodes' - 'readChapters' - 'readVolumes')
    WHERE metadata IS NOT NULL
      AND (metadata ? 'watchedEpisodes' OR metadata ? 'readChapters' OR metadata ? 'readVolumes');
END $$;
