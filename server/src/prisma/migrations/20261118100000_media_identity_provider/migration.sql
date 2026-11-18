-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "IdSource" AS ENUM ('openlibrary', 'goodreads', 'isbn', 'isbn13', 'lastfm', 'musicbrainz', 'anilist', 'mal', 'tmdb', 'imdb', 'letterboxd', 'rawg', 'bgg', 'google_books');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Normalize source names
UPDATE "Media" SET "source" = 'openlibrary' WHERE "source" = 'open_library';
UPDATE "MediaExternalId" SET "provider" = 'openlibrary' WHERE "provider" = 'open_library';
UPDATE "Media" SET "source" = 'mal' WHERE "source" = 'jikan';
UPDATE "MediaExternalId" SET "provider" = 'mal' WHERE "provider" = 'jikan';

-- Ensure every existing (source, sourceId) has an external id before conversion
INSERT INTO "MediaExternalId" ("id", "mediaId", "provider", "externalId", "created_at")
SELECT
    gen_random_uuid(),
    m.id,
    m."source",
    m."sourceId",
    NOW()
FROM "Media" m
WHERE m."source" IS NOT NULL AND m."sourceId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "MediaExternalId" e
    WHERE e."provider" = m."source" AND e."externalId" = m."sourceId"
  )
ON CONFLICT ("provider", "externalId") DO NOTHING;

-- Convert Goodreads books that have an Open Library work key
UPDATE "Media" m
SET "source" = 'openlibrary',
    "sourceId" = COALESCE(
        NULLIF(m.metadata->>'openLibraryWorkKey', ''),
        (SELECT e."externalId" FROM "MediaExternalId" e WHERE e."mediaId" = m.id AND e."provider" = 'openlibrary' LIMIT 1)
    )
WHERE m."source" = 'goodreads'
  AND (
    (m.metadata->>'openLibraryWorkKey' IS NOT NULL AND m.metadata->>'openLibraryWorkKey' != '')
    OR EXISTS (
      SELECT 1 FROM "MediaExternalId" e WHERE e."mediaId" = m.id AND e."provider" = 'openlibrary'
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM "Media" existing
    WHERE existing."source" = 'openlibrary'
      AND existing."sourceId" = COALESCE(
          NULLIF(m.metadata->>'openLibraryWorkKey', ''),
          (SELECT e."externalId" FROM "MediaExternalId" e WHERE e."mediaId" = m.id AND e."provider" = 'openlibrary' LIMIT 1)
      )
  );

-- Convert Last.fm tracks with recording id
UPDATE "Media" m
SET "source" = 'musicbrainz',
    "sourceId" = COALESCE(
        NULLIF(m.metadata->>'mbRecordingId', ''),
        (SELECT e."externalId" FROM "MediaExternalId" e WHERE e."mediaId" = m.id AND e."provider" = 'musicbrainz' LIMIT 1)
    )
WHERE m."source" = 'lastfm'
  AND (
    (m.metadata->>'mbRecordingId' IS NOT NULL AND m.metadata->>'mbRecordingId' != '')
    OR (m.kind = 'track' AND EXISTS (SELECT 1 FROM "MediaExternalId" e WHERE e."mediaId" = m.id AND e."provider" = 'musicbrainz'))
  )
  AND NOT EXISTS (
    SELECT 1 FROM "Media" existing
    WHERE existing."source" = 'musicbrainz'
      AND existing."sourceId" = COALESCE(
          NULLIF(m.metadata->>'mbRecordingId', ''),
          (SELECT e."externalId" FROM "MediaExternalId" e WHERE e."mediaId" = m.id AND e."provider" = 'musicbrainz' LIMIT 1)
      )
  );

-- Convert Last.fm albums with release group id
UPDATE "Media" m
SET "source" = 'musicbrainz',
    "sourceId" = COALESCE(
        NULLIF(m.metadata->>'mbReleaseGroupId', ''),
        (SELECT e."externalId" FROM "MediaExternalId" e WHERE e."mediaId" = m.id AND e."provider" = 'musicbrainz' LIMIT 1)
    )
WHERE m."source" = 'lastfm'
  AND (
    (m.metadata->>'mbReleaseGroupId' IS NOT NULL AND m.metadata->>'mbReleaseGroupId' != '')
    OR (m.kind = 'album' AND EXISTS (SELECT 1 FROM "MediaExternalId" e WHERE e."mediaId" = m.id AND e."provider" = 'musicbrainz'))
  )
  AND NOT EXISTS (
    SELECT 1 FROM "Media" existing
    WHERE existing."source" = 'musicbrainz'
      AND existing."sourceId" = COALESCE(
          NULLIF(m.metadata->>'mbReleaseGroupId', ''),
          (SELECT e."externalId" FROM "MediaExternalId" e WHERE e."mediaId" = m.id AND e."provider" = 'musicbrainz' LIMIT 1)
      )
  );

-- Ensure converted rows also have an external id for their new (provider, providerId)
INSERT INTO "MediaExternalId" ("id", "mediaId", "provider", "externalId", "created_at")
SELECT
    gen_random_uuid(),
    m.id,
    m."source",
    m."sourceId",
    NOW()
FROM "Media" m
WHERE m."source" IS NOT NULL AND m."sourceId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "MediaExternalId" e
    WHERE e."provider" = m."source" AND e."externalId" = m."sourceId"
  )
ON CONFLICT ("provider", "externalId") DO NOTHING;

-- Drop old constraints / indexes
DROP INDEX IF EXISTS "Media_source_sourceId_key";
DROP INDEX IF EXISTS "Media_userId_creator_title_year_mediaTypeId_source_key";

-- Rename columns
ALTER TABLE "Media" RENAME COLUMN "source" TO "provider";
ALTER TABLE "Media" RENAME COLUMN "sourceId" TO "providerId";

-- Alter column types
ALTER TABLE "Media" ALTER COLUMN "provider" TYPE "IdSource" USING ("provider"::"IdSource");
ALTER TABLE "MediaExternalId" ALTER COLUMN "provider" TYPE "IdSource" USING ("provider"::"IdSource");

-- Create new unique indexes
CREATE UNIQUE INDEX "Media_provider_providerId_key" ON "Media"("provider", "providerId");
CREATE UNIQUE INDEX "Media_userId_creator_title_year_mediaTypeId_key" ON "Media"("userId", "creator", "title", "year", "mediaTypeId") WHERE ("provider" IS NULL);
