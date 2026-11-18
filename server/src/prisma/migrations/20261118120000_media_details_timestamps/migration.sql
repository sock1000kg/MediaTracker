-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "MediaSubtype" AS ENUM ('album', 'track', 'show', 'season');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "LogStatus" AS ENUM ('wishlist', 'completed', 'in progress', 'dropped');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable Media: add new columns
ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "subtype" "MediaSubtype";
ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "releaseDate" DATE;
ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "details" JSONB;
ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "syncedAt" TIMESTAMP(3);
ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "syncCheckedAt" TIMESTAMP(3);
ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "purgedAt" TIMESTAMP(3);

-- AlterTable UserLogs: add progress columns
ALTER TABLE "UserLogs" ADD COLUMN IF NOT EXISTS "progressEpisodes" INTEGER;
ALTER TABLE "UserLogs" ADD COLUMN IF NOT EXISTS "progressChapters" INTEGER;
ALTER TABLE "UserLogs" ADD COLUMN IF NOT EXISTS "progressVolumes" INTEGER;

-- UserLogs status column alter to LogStatus enum
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'UserLogs' AND column_name = 'status' AND udt_name != 'LogStatus'
    ) THEN
        ALTER TABLE "UserLogs" ALTER COLUMN "status" TYPE "LogStatus" USING (
            CASE
                WHEN "status" IN ('wishlist', 'completed', 'in progress', 'dropped') THEN "status"::"LogStatus"
                ELSE NULL
            END
        );
    END IF;
END $$;

-- Data migration from UserLogs.progress
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'UserLogs' AND column_name = 'progress'
    ) THEN
        UPDATE "UserLogs"
        SET "progressEpisodes" = NULLIF(progress->>'watchedEpisodes', '')::INTEGER,
            "progressChapters" = NULLIF(progress->>'readChapters', '')::INTEGER,
            "progressVolumes" = NULLIF(progress->>'readVolumes', '')::INTEGER
        WHERE progress IS NOT NULL;

        ALTER TABLE "UserLogs" DROP COLUMN IF EXISTS "progress";
    END IF;
END $$;

-- Data migration from Media.metadata and Media.kind
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'Media' AND column_name = 'metadata'
    ) THEN

        -- Backfill MediaExternalId from metadata ids
        -- mal
        INSERT INTO "MediaExternalId" ("id", "mediaId", "provider", "externalId", "created_at")
        SELECT gen_random_uuid(), m.id, 'mal', m.metadata->>'idMal', NOW()
        FROM "Media" m
        WHERE m.metadata->>'idMal' IS NOT NULL AND m.metadata->>'idMal' != ''
          AND NOT EXISTS (
            SELECT 1 FROM "MediaExternalId" e WHERE e."provider" = 'mal' AND e."externalId" = (m.metadata->>'idMal')
          )
        ON CONFLICT ("provider", "externalId") DO NOTHING;

        -- tmdb
        INSERT INTO "MediaExternalId" ("id", "mediaId", "provider", "externalId", "created_at")
        SELECT gen_random_uuid(), m.id, 'tmdb', m.metadata->>'tmdbId', NOW()
        FROM "Media" m
        WHERE m.metadata->>'tmdbId' IS NOT NULL AND m.metadata->>'tmdbId' != ''
          AND NOT EXISTS (
            SELECT 1 FROM "MediaExternalId" e WHERE e."provider" = 'tmdb' AND e."externalId" = (m.metadata->>'tmdbId')
          )
        ON CONFLICT ("provider", "externalId") DO NOTHING;

        -- imdb
        INSERT INTO "MediaExternalId" ("id", "mediaId", "provider", "externalId", "created_at")
        SELECT gen_random_uuid(), m.id, 'imdb', m.metadata->>'imdbId', NOW()
        FROM "Media" m
        WHERE m.metadata->>'imdbId' IS NOT NULL AND m.metadata->>'imdbId' != ''
          AND NOT EXISTS (
            SELECT 1 FROM "MediaExternalId" e WHERE e."provider" = 'imdb' AND e."externalId" = (m.metadata->>'imdbId')
          )
        ON CONFLICT ("provider", "externalId") DO NOTHING;

        -- musicbrainz: mbid (becomes musicbrainz external id when differing from providerId)
        INSERT INTO "MediaExternalId" ("id", "mediaId", "provider", "externalId", "created_at")
        SELECT gen_random_uuid(), m.id, 'musicbrainz', m.metadata->>'mbid', NOW()
        FROM "Media" m
        WHERE m.metadata->>'mbid' IS NOT NULL AND m.metadata->>'mbid' != ''
          AND (m."provider" != 'musicbrainz' OR m."providerId" IS DISTINCT FROM (m.metadata->>'mbid'))
          AND NOT EXISTS (
            SELECT 1 FROM "MediaExternalId" e WHERE e."provider" = 'musicbrainz' AND e."externalId" = (m.metadata->>'mbid')
          )
        ON CONFLICT ("provider", "externalId") DO NOTHING;

        -- musicbrainz: mbReleaseGroupId
        INSERT INTO "MediaExternalId" ("id", "mediaId", "provider", "externalId", "created_at")
        SELECT gen_random_uuid(), m.id, 'musicbrainz', m.metadata->>'mbReleaseGroupId', NOW()
        FROM "Media" m
        WHERE m.metadata->>'mbReleaseGroupId' IS NOT NULL AND m.metadata->>'mbReleaseGroupId' != ''
          AND NOT EXISTS (
            SELECT 1 FROM "MediaExternalId" e WHERE e."provider" = 'musicbrainz' AND e."externalId" = (m.metadata->>'mbReleaseGroupId')
          )
        ON CONFLICT ("provider", "externalId") DO NOTHING;

        -- musicbrainz: mbRecordingId
        INSERT INTO "MediaExternalId" ("id", "mediaId", "provider", "externalId", "created_at")
        SELECT gen_random_uuid(), m.id, 'musicbrainz', m.metadata->>'mbRecordingId', NOW()
        FROM "Media" m
        WHERE m.metadata->>'mbRecordingId' IS NOT NULL AND m.metadata->>'mbRecordingId' != ''
          AND NOT EXISTS (
            SELECT 1 FROM "MediaExternalId" e WHERE e."provider" = 'musicbrainz' AND e."externalId" = (m.metadata->>'mbRecordingId')
          )
        ON CONFLICT ("provider", "externalId") DO NOTHING;

        -- openlibrary: openLibraryWorkKey
        INSERT INTO "MediaExternalId" ("id", "mediaId", "provider", "externalId", "created_at")
        SELECT gen_random_uuid(), m.id, 'openlibrary', m.metadata->>'openLibraryWorkKey', NOW()
        FROM "Media" m
        WHERE m.metadata->>'openLibraryWorkKey' IS NOT NULL AND m.metadata->>'openLibraryWorkKey' != ''
          AND NOT EXISTS (
            SELECT 1 FROM "MediaExternalId" e WHERE e."provider" = 'openlibrary' AND e."externalId" = (m.metadata->>'openLibraryWorkKey')
          )
        ON CONFLICT ("provider", "externalId") DO NOTHING;

        -- Backfill missing genres from metadata.categories
        INSERT INTO "Genre" ("id", "name", "nameKey")
        SELECT gen_random_uuid(), cat, lower(trim(cat))
        FROM (
          SELECT DISTINCT jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof(m.metadata->'categories') = 'array' THEN m.metadata->'categories'
              ELSE '[]'::jsonb
            END
          ) as cat
          FROM "Media" m
          WHERE m.metadata->'categories' IS NOT NULL
        ) cats
        WHERE cat != ''
        ON CONFLICT ("nameKey") DO NOTHING;

        INSERT INTO "MediaGenre" ("mediaId", "genreId", "position")
        SELECT m.id, g.id, 0
        FROM "Media" m
        CROSS JOIN LATERAL jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(m.metadata->'categories') = 'array' THEN m.metadata->'categories'
            ELSE '[]'::jsonb
          END
        ) cat
        JOIN "Genre" g ON g."nameKey" = lower(trim(cat))
        WHERE NOT EXISTS (SELECT 1 FROM "MediaGenre" mg WHERE mg."mediaId" = m.id)
        ON CONFLICT ("mediaId", "genreId") DO NOTHING;

        -- Subtype:
        -- Only album, track, show, season are kept; Media.kind column wins over key;
        -- music rows with mbRecordingId or durationSec become track; with mbReleaseGroupId or primaryType become album.
        UPDATE "Media" m
        SET "subtype" = CASE
          WHEN m."kind" IN ('album', 'track', 'show', 'season') THEN m."kind"::"MediaSubtype"
          WHEN m.metadata->>'kind' IN ('album', 'track', 'show', 'season') THEN (m.metadata->>'kind')::"MediaSubtype"
          WHEN (m."provider" IN ('musicbrainz', 'lastfm') OR mt.name = 'music') AND m.metadata->>'mbRecordingId' IS NOT NULL THEN 'track'::"MediaSubtype"
          WHEN (m."provider" IN ('musicbrainz', 'lastfm') OR mt.name = 'music') AND m.metadata->>'durationSec' IS NOT NULL THEN 'track'::"MediaSubtype"
          WHEN (m."provider" IN ('musicbrainz', 'lastfm') OR mt.name = 'music') AND (m.metadata->>'mbReleaseGroupId' IS NOT NULL OR m.metadata->>'primaryType' IS NOT NULL) THEN 'album'::"MediaSubtype"
          ELSE NULL
        END
        FROM "MediaType" mt
        WHERE mt.id = m."mediaTypeId";

        -- OriginalTitle, Creator, Position
        UPDATE "Media"
        SET "originalTitle" = metadata->>'originalTitle'
        WHERE ("originalTitle" IS NULL OR "originalTitle" = '')
          AND metadata->>'originalTitle' IS NOT NULL AND metadata->>'originalTitle' != '';

        UPDATE "Media"
        SET "creator" = metadata->>'creator'
        WHERE ("creator" IS NULL OR "creator" = '')
          AND metadata->>'creator' IS NOT NULL AND metadata->>'creator' != '';

        UPDATE "Media"
        SET "position" = COALESCE(
          "position",
          NULLIF(metadata->>'trackNumber', '')::INTEGER,
          NULLIF(metadata->>'seasonNumber', '')::INTEGER
        )
        WHERE "position" IS NULL
          AND (metadata->>'trackNumber' IS NOT NULL OR metadata->>'seasonNumber' IS NOT NULL);

        -- Parent link from albumSourceId
        UPDATE "Media" child
        SET "parentId" = parent.id
        FROM "Media" parent
        WHERE child."parentId" IS NULL
          AND child.metadata->>'albumSourceId' IS NOT NULL
          AND (
            parent."providerId" = (child.metadata->>'albumSourceId')
            OR EXISTS (
              SELECT 1 FROM "MediaExternalId" e
              WHERE e."mediaId" = parent.id AND e."externalId" = (child.metadata->>'albumSourceId')
            )
          )
          AND (parent.subtype = 'album' OR parent.kind = 'album');

        -- Parent link from album / showTitle if missing
        UPDATE "Media" child
        SET "parentId" = parent.id
        FROM "Media" parent
        WHERE child."parentId" IS NULL
          AND child.metadata->>'album' IS NOT NULL
          AND parent.title = child.metadata->>'album'
          AND (parent.subtype = 'album' OR parent.kind = 'album');

        UPDATE "Media" child
        SET "parentId" = parent.id
        FROM "Media" parent
        WHERE child."parentId" IS NULL
          AND child.metadata->>'showTitle' IS NOT NULL
          AND parent.title = child.metadata->>'showTitle'
          AND (parent.subtype = 'show' OR parent.kind = 'show');

        -- releaseDate: firstAirDate, airDate, firstReleaseDate
        UPDATE "Media"
        SET "releaseDate" = (
          CASE
            WHEN (metadata->>'firstAirDate') ~ '^\d{4}-\d{2}-\d{2}' THEN substring(metadata->>'firstAirDate' from '^\d{4}-\d{2}-\d{2}')::DATE
            WHEN (metadata->>'airDate') ~ '^\d{4}-\d{2}-\d{2}' THEN substring(metadata->>'airDate' from '^\d{4}-\d{2}-\d{2}')::DATE
            WHEN (metadata->>'firstReleaseDate') ~ '^\d{4}-\d{2}-\d{2}' THEN substring(metadata->>'firstReleaseDate' from '^\d{4}-\d{2}-\d{2}')::DATE
            WHEN (metadata->>'firstAirDate') ~ '^\d{4}-\d{2}$' THEN ((metadata->>'firstAirDate') || '-01')::DATE
            WHEN (metadata->>'airDate') ~ '^\d{4}-\d{2}$' THEN ((metadata->>'airDate') || '-01')::DATE
            WHEN (metadata->>'firstReleaseDate') ~ '^\d{4}-\d{2}$' THEN ((metadata->>'firstReleaseDate') || '-01')::DATE
            WHEN (metadata->>'firstAirDate') ~ '^\d{4}$' THEN ((metadata->>'firstAirDate') || '-01-01')::DATE
            WHEN (metadata->>'airDate') ~ '^\d{4}$' THEN ((metadata->>'airDate') || '-01-01')::DATE
            WHEN (metadata->>'firstReleaseDate') ~ '^\d{4}$' THEN ((metadata->>'firstReleaseDate') || '-01-01')::DATE
            ELSE NULL
          END
        )
        WHERE metadata->>'firstAirDate' IS NOT NULL
           OR metadata->>'airDate' IS NOT NULL
           OR metadata->>'firstReleaseDate' IS NOT NULL;

        -- Bookkeeping timestamps:
        -- syncedAt: latest of fetchedAt, refreshedAt
        UPDATE "Media"
        SET "syncedAt" = (
          SELECT MAX(ts)
          FROM (
            VALUES
              (NULLIF(metadata->>'fetchedAt', '')::TIMESTAMPTZ),
              (NULLIF(metadata->>'refreshedAt', '')::TIMESTAMPTZ)
          ) AS t(ts)
          WHERE ts IS NOT NULL
        )
        WHERE metadata->>'fetchedAt' IS NOT NULL
           OR metadata->>'refreshedAt' IS NOT NULL;

        -- syncCheckedAt: latest of refreshCheckedAt, mbSyncedAt, olSyncedAt, coverResolvedAt
        UPDATE "Media"
        SET "syncCheckedAt" = (
          SELECT MAX(ts)
          FROM (
            VALUES
              (NULLIF(metadata->>'refreshCheckedAt', '')::TIMESTAMPTZ),
              (NULLIF(metadata->>'mbSyncedAt', '')::TIMESTAMPTZ),
              (NULLIF(metadata->>'olSyncedAt', '')::TIMESTAMPTZ),
              (NULLIF(metadata->>'coverResolvedAt', '')::TIMESTAMPTZ)
          ) AS t(ts)
          WHERE ts IS NOT NULL
        )
        WHERE metadata->>'refreshCheckedAt' IS NOT NULL
           OR metadata->>'mbSyncedAt' IS NOT NULL
           OR metadata->>'olSyncedAt' IS NOT NULL
           OR metadata->>'coverResolvedAt' IS NOT NULL;

        -- purgedAt
        UPDATE "Media"
        SET "purgedAt" = NULLIF(metadata->>'purgedAt', '')::TIMESTAMPTZ
        WHERE metadata->>'purgedAt' IS NOT NULL;

        -- Details JSON
        UPDATE "Media" m
        SET "details" = sub.details
        FROM (
          SELECT
            m2.id,
            CASE
              -- Custom media (provider IS NULL)
              WHEN m2."provider" IS NULL THEN
                NULLIF(jsonb_strip_nulls(jsonb_build_object(
                  'durationSec', COALESCE(
                    NULLIF(m2.metadata->>'durationSec', '')::INTEGER,
                    (CASE WHEN (m2.metadata->>'duration') ~ '^\d+$' THEN (m2.metadata->>'duration')::INTEGER ELSE NULL END)
                  ),
                  'edition', NULLIF(m2.metadata->>'edition', ''),
                  'language', NULLIF(m2.metadata->>'language', ''),
                  'pageCount', NULLIF(m2.metadata->>'pageCount', '')::INTEGER,
                  'url', NULLIF(m2.metadata->>'url', '')
                )), '{}'::jsonb)

              -- Subtype album
              WHEN m2."subtype" = 'album' THEN
                NULLIF(jsonb_strip_nulls(jsonb_build_object(
                  'format', COALESCE(NULLIF(m2.metadata->>'format', ''), NULLIF(m2.metadata->>'primaryType', '')),
                  'formatTags', CASE
                    WHEN jsonb_typeof(m2.metadata->'formatTags') = 'array' THEN m2.metadata->'formatTags'
                    WHEN jsonb_typeof(m2.metadata->'secondaryTypes') = 'array' THEN m2.metadata->'secondaryTypes'
                    ELSE NULL
                  END
                )), '{}'::jsonb)

              -- Subtype track
              WHEN m2."subtype" = 'track' THEN
                NULLIF(jsonb_strip_nulls(jsonb_build_object(
                  'durationSec', NULLIF(m2.metadata->>'durationSec', '')::INTEGER
                )), '{}'::jsonb)

              -- Subtype show (episodeCount kept in details)
              WHEN m2."subtype" = 'show' THEN
                NULLIF(jsonb_strip_nulls(jsonb_build_object(
                  'seasonCount', NULLIF(m2.metadata->>'seasonCount', '')::INTEGER,
                  'episodeCount', NULLIF(m2.metadata->>'episodeCount', '')::INTEGER,
                  'networks', CASE WHEN jsonb_typeof(m2.metadata->'networks') = 'array' THEN m2.metadata->'networks' ELSE NULL END,
                  'country', COALESCE(NULLIF(m2.metadata->>'country', ''), NULLIF(m2.metadata->>'originCountry', '')),
                  'airingStatus', COALESCE(NULLIF(m2.metadata->>'airingStatus', ''), NULLIF(m2.metadata->>'status', '')),
                  'language', COALESCE(NULLIF(m2.metadata->>'language', ''), NULLIF(m2.metadata->>'originalLanguage', '')),
                  'score', NULLIF(m2.metadata->>'score', '')::DOUBLE PRECISION,
                  'scoreScale', COALESCE(
                    NULLIF(m2.metadata->>'scoreScale', ''),
                    CASE WHEN m2."provider" = 'tmdb' AND m2.metadata->>'score' IS NOT NULL THEN 'tmdb_10' ELSE NULL END
                  )
                )), '{}'::jsonb)

              -- Subtype season (networks dropped)
              WHEN m2."subtype" = 'season' THEN
                NULLIF(jsonb_strip_nulls(jsonb_build_object(
                  'episodeCount', NULLIF(m2.metadata->>'episodeCount', '')::INTEGER
                )), '{}'::jsonb)

              -- Subtype is NULL: check MediaType
              -- book
              WHEN mt.name = 'book' THEN
                NULLIF(jsonb_strip_nulls(jsonb_build_object(
                  'pageCount', NULLIF(m2.metadata->>'pageCount', '')::INTEGER,
                  'publisher', NULLIF(m2.metadata->>'publisher', '')
                )), '{}'::jsonb)

              -- movie
              WHEN mt.name = 'movie' THEN
                NULLIF(jsonb_strip_nulls(jsonb_build_object(
                  'durationSec', COALESCE(
                    NULLIF(m2.metadata->>'durationSec', '')::INTEGER,
                    (NULLIF(m2.metadata->>'runtime', '')::INTEGER * 60)
                  ),
                  'language', COALESCE(NULLIF(m2.metadata->>'language', ''), NULLIF(m2.metadata->>'originalLanguage', '')),
                  'score', NULLIF(m2.metadata->>'score', '')::DOUBLE PRECISION,
                  'scoreScale', COALESCE(
                    NULLIF(m2.metadata->>'scoreScale', ''),
                    CASE WHEN m2."provider" = 'tmdb' AND m2.metadata->>'score' IS NOT NULL THEN 'tmdb_10' ELSE NULL END
                  )
                )), '{}'::jsonb)

              -- anime (durationSec from episodeMinutes * 60)
              WHEN mt.name = 'anime' THEN
                NULLIF(jsonb_strip_nulls(jsonb_build_object(
                  'format', NULLIF(m2.metadata->>'format', ''),
                  'episodeCount', COALESCE(NULLIF(m2.metadata->>'episodeCount', '')::INTEGER, NULLIF(m2.metadata->>'episodes', '')::INTEGER),
                  'durationSec', COALESCE(
                    NULLIF(m2.metadata->>'durationSec', '')::INTEGER,
                    (NULLIF(m2.metadata->>'episodeMinutes', '')::INTEGER * 60)
                  ),
                  'score', NULLIF(m2.metadata->>'score', '')::DOUBLE PRECISION,
                  'scoreScale', CASE
                    WHEN m2.metadata->>'scoreScale' = 'anilist' THEN 'anilist_100'
                    WHEN m2.metadata->>'scoreScale' IS NOT NULL THEN m2.metadata->>'scoreScale'
                    WHEN m2."provider" = 'anilist' AND m2.metadata->>'score' IS NOT NULL THEN 'anilist_100'
                    WHEN m2."provider" = 'mal' AND m2.metadata->>'score' IS NOT NULL THEN 'mal_10'
                    ELSE NULL
                  END
                )), '{}'::jsonb)

              -- manga
              WHEN mt.name = 'manga' THEN
                NULLIF(jsonb_strip_nulls(jsonb_build_object(
                  'format', NULLIF(m2.metadata->>'format', ''),
                  'chapterCount', COALESCE(NULLIF(m2.metadata->>'chapterCount', '')::INTEGER, NULLIF(m2.metadata->>'chapters', '')::INTEGER),
                  'volumeCount', COALESCE(NULLIF(m2.metadata->>'volumeCount', '')::INTEGER, NULLIF(m2.metadata->>'volumes', '')::INTEGER),
                  'score', NULLIF(m2.metadata->>'score', '')::DOUBLE PRECISION,
                  'scoreScale', CASE
                    WHEN m2.metadata->>'scoreScale' = 'anilist' THEN 'anilist_100'
                    WHEN m2.metadata->>'scoreScale' IS NOT NULL THEN m2.metadata->>'scoreScale'
                    WHEN m2."provider" = 'anilist' AND m2.metadata->>'score' IS NOT NULL THEN 'anilist_100'
                    WHEN m2."provider" = 'mal' AND m2.metadata->>'score' IS NOT NULL THEN 'mal_10'
                    ELSE NULL
                  END
                )), '{}'::jsonb)

              -- game
              WHEN mt.name = 'game' THEN
                NULLIF(jsonb_strip_nulls(jsonb_build_object(
                  'platforms', CASE WHEN jsonb_typeof(m2.metadata->'platforms') = 'array' THEN m2.metadata->'platforms' ELSE NULL END,
                  'publishers', CASE WHEN jsonb_typeof(m2.metadata->'publishers') = 'array' THEN m2.metadata->'publishers' ELSE NULL END,
                  'score', NULLIF(m2.metadata->>'score', '')::DOUBLE PRECISION,
                  'scoreScale', COALESCE(
                    NULLIF(m2.metadata->>'scoreScale', ''),
                    CASE WHEN (m2."provider" = 'rawg' OR m2.metadata->>'score' IS NOT NULL) THEN 'rawg_5' ELSE NULL END
                  ),
                  'metacritic', NULLIF(m2.metadata->>'metacritic', '')::INTEGER,
                  'avgPlaytimeHours', COALESCE(
                    NULLIF(m2.metadata->>'avgPlaytimeHours', '')::DOUBLE PRECISION,
                    NULLIF(m2.metadata->>'playtimeHours', '')::DOUBLE PRECISION
                  )
                )), '{}'::jsonb)

              -- boardgame (mapping playingTime -> playTimeMin, minPlayTime -> minPlayTimeMin, maxPlayTime -> maxPlayTimeMin)
              WHEN mt.name = 'boardgame' THEN
                NULLIF(jsonb_strip_nulls(jsonb_build_object(
                  'minPlayers', NULLIF(m2.metadata->>'minPlayers', '')::INTEGER,
                  'maxPlayers', NULLIF(m2.metadata->>'maxPlayers', '')::INTEGER,
                  'playTimeMin', COALESCE(
                    NULLIF(m2.metadata->>'playTimeMin', '')::INTEGER,
                    NULLIF(m2.metadata->>'playingTime', '')::INTEGER
                  ),
                  'minPlayTimeMin', COALESCE(
                    NULLIF(m2.metadata->>'minPlayTimeMin', '')::INTEGER,
                    NULLIF(m2.metadata->>'minPlayTime', '')::INTEGER
                  ),
                  'maxPlayTimeMin', COALESCE(
                    NULLIF(m2.metadata->>'maxPlayTimeMin', '')::INTEGER,
                    NULLIF(m2.metadata->>'maxPlayTime', '')::INTEGER
                  ),
                  'score', COALESCE(
                    NULLIF(m2.metadata->>'score', '')::DOUBLE PRECISION,
                    NULLIF(m2.metadata->>'bggRating', '')::DOUBLE PRECISION
                  ),
                  'scoreScale', COALESCE(
                    NULLIF(m2.metadata->>'scoreScale', ''),
                    CASE WHEN (m2.metadata->>'bggRating' IS NOT NULL OR m2.metadata->>'score' IS NOT NULL) THEN 'bgg_10' ELSE NULL END
                  )
                )), '{}'::jsonb)

              ELSE NULL
            END AS details
          FROM "Media" m2
          LEFT JOIN "MediaType" mt ON mt.id = m2."mediaTypeId"
        ) sub
        WHERE m.id = sub.id;

        -- Leftover detection: count unknown keys in metadata before dropping
        DECLARE
          rec RECORD;
        BEGIN
          FOR rec IN
            SELECT key, COUNT(*) as cnt
            FROM "Media" m,
            LATERAL jsonb_object_keys(
              CASE WHEN jsonb_typeof(m.metadata) = 'object' THEN m.metadata ELSE '{}'::jsonb END
            ) AS key
            WHERE key NOT IN (
              'airDate', 'album', 'albumSourceId', 'avgPlaytimeHours', 'bggRating', 'categories',
              'chapterCount', 'chapters', 'country', 'coverResolvedAt', 'creator', 'duration',
              'durationSec', 'edition', 'episodeCount', 'episodeMinutes', 'episodes', 'fetchedAt',
              'firstAirDate', 'firstReleaseDate', 'format', 'formatTags', 'idMal', 'imdbId', 'kind',
              'language', 'maxPlayTime', 'maxPlayTimeMin', 'maxPlayers', 'mbRecordingId',
              'mbReleaseGroupId', 'mbSyncedAt', 'mbid', 'metacritic', 'minPlayTime', 'minPlayTimeMin',
              'minPlayers', 'networks', 'olSyncedAt', 'openLibraryWorkKey', 'originCountry',
              'originalLanguage', 'originalTitle', 'pageCount', 'platforms', 'playTimeMin',
              'playingTime', 'playtimeHours', 'primaryType', 'publisher', 'publishers', 'purgedAt',
              'refreshCheckedAt', 'refreshedAt', 'runtime', 'score', 'scoreScale', 'seasonCount',
              'seasonNumber', 'secondaryTypes', 'showTitle', 'status', 'tmdbId', 'trackNumber',
              'url', 'volumeCount', 'volumes'
            )
            GROUP BY key
            ORDER BY cnt DESC, key ASC
          LOOP
            RAISE NOTICE 'Unknown metadata key: % (count: %)', rec.key, rec.cnt;
          END LOOP;
        END;

        -- Drop old columns
        ALTER TABLE "Media" DROP COLUMN IF EXISTS "metadata";
        ALTER TABLE "Media" DROP COLUMN IF EXISTS "kind";

    END IF;
END $$;

-- Update indexes
DROP INDEX IF EXISTS "Media_kind_idx";
CREATE INDEX IF NOT EXISTS "Media_provider_syncCheckedAt_idx" ON "Media"("provider", "syncCheckedAt");
