-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "kind" TEXT,
ADD COLUMN     "originalTitle" TEXT;

-- CreateTable
CREATE TABLE "Genre" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,

    CONSTRAINT "Genre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaGenre" (
    "mediaId" INTEGER NOT NULL,
    "genreId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "MediaGenre_pkey" PRIMARY KEY ("mediaId","genreId")
);

-- CreateTable
CREATE TABLE "Creator" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,

    CONSTRAINT "Creator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaCreator" (
    "mediaId" INTEGER NOT NULL,
    "creatorId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "MediaCreator_pkey" PRIMARY KEY ("mediaId","creatorId","role")
);

-- CreateIndex
CREATE UNIQUE INDEX "Genre_nameKey_key" ON "Genre"("nameKey");

-- CreateIndex
CREATE INDEX "MediaGenre_genreId_idx" ON "MediaGenre"("genreId");

-- CreateIndex
CREATE UNIQUE INDEX "Creator_nameKey_key" ON "Creator"("nameKey");

-- CreateIndex
CREATE INDEX "MediaCreator_creatorId_idx" ON "MediaCreator"("creatorId");

-- CreateIndex
CREATE INDEX "Media_kind_idx" ON "Media"("kind");

-- AddForeignKey
ALTER TABLE "MediaGenre" ADD CONSTRAINT "MediaGenre_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaGenre" ADD CONSTRAINT "MediaGenre_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "Genre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaCreator" ADD CONSTRAINT "MediaCreator_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaCreator" ADD CONSTRAINT "MediaCreator_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill 1: kind and originalTitle columns
UPDATE "Media"
SET "kind" = "metadata"->>'kind',
    "originalTitle" = "metadata"->>'originalTitle'
WHERE "metadata" IS NOT NULL
  AND ("metadata" ? 'kind' OR "metadata" ? 'originalTitle');

-- Backfill 2: Genre and MediaGenre from metadata->'categories'
INSERT INTO "Genre" ("name", "nameKey")
SELECT DISTINCT ON (nameKey) name, nameKey
FROM (
    SELECT
        trim(elem) AS name,
        regexp_replace(trim(lower(elem)), '\s+', ' ', 'g') AS nameKey,
        m.id,
        pos
    FROM "Media" m,
    LATERAL jsonb_array_elements_text(m.metadata->'categories') WITH ORDINALITY AS t(elem, pos)
    WHERE m.metadata IS NOT NULL
      AND jsonb_typeof(m.metadata->'categories') = 'array'
      AND trim(elem) <> ''
    ORDER BY m.id ASC, pos ASC
) sub
ORDER BY nameKey, id ASC, pos ASC
ON CONFLICT ("nameKey") DO NOTHING;

INSERT INTO "MediaGenre" ("mediaId", "genreId", "position")
SELECT sub."mediaId", g.id, sub."position"
FROM (
    SELECT
        m.id AS "mediaId",
        regexp_replace(trim(lower(elem)), '\s+', ' ', 'g') AS nameKey,
        (pos - 1)::integer AS "position"
    FROM "Media" m,
    LATERAL jsonb_array_elements_text(m.metadata->'categories') WITH ORDINALITY AS t(elem, pos)
    WHERE m.metadata IS NOT NULL
      AND jsonb_typeof(m.metadata->'categories') = 'array'
      AND trim(elem) <> ''
) sub
JOIN "Genre" g ON g."nameKey" = sub.nameKey
ON CONFLICT ("mediaId", "genreId") DO NOTHING;

-- Backfill 3: Creator and MediaCreator from Media.creator
WITH creators_raw AS (
    -- Non-music: split on ', '
    SELECT
        m.id AS "mediaId",
        trim(elem) AS "name",
        regexp_replace(trim(lower(elem)), '\s+', ' ', 'g') AS "nameKey",
        CASE lower(coalesce(mt.name, ''))
            WHEN 'book' THEN 'author'
            WHEN 'movie' THEN 'director'
            WHEN 'game' THEN 'developer'
            WHEN 'anime' THEN 'studio'
            WHEN 'manga' THEN 'author'
            WHEN 'tv' THEN 'creator'
            ELSE 'creator'
        END AS role,
        (pos - 1)::integer AS "position",
        m.id AS sort_id,
        pos AS sort_pos
    FROM "Media" m
    LEFT JOIN "MediaType" mt ON mt.id = m."mediaTypeId",
    LATERAL unnest(string_to_array(m.creator, ', ')) WITH ORDINALITY AS t(elem, pos)
    WHERE m.creator IS NOT NULL
      AND trim(m.creator) <> ''
      AND lower(coalesce(mt.name, '')) <> 'music'
      AND trim(elem) <> ''

    UNION ALL

    -- Music: never split
    SELECT
        m.id AS "mediaId",
        trim(m.creator) AS "name",
        regexp_replace(trim(lower(m.creator)), '\s+', ' ', 'g') AS "nameKey",
        'artist' AS role,
        0::integer AS "position",
        m.id AS sort_id,
        1::bigint AS sort_pos
    FROM "Media" m
    JOIN "MediaType" mt ON mt.id = m."mediaTypeId"
    WHERE m.creator IS NOT NULL
      AND trim(m.creator) <> ''
      AND lower(mt.name) = 'music'
)
INSERT INTO "Creator" ("name", "nameKey")
SELECT DISTINCT ON ("nameKey") "name", "nameKey"
FROM creators_raw
ORDER BY "nameKey", sort_id ASC, sort_pos ASC
ON CONFLICT ("nameKey") DO NOTHING;

WITH creators_raw AS (
    -- Non-music: split on ', '
    SELECT
        m.id AS "mediaId",
        trim(elem) AS "name",
        regexp_replace(trim(lower(elem)), '\s+', ' ', 'g') AS "nameKey",
        CASE lower(coalesce(mt.name, ''))
            WHEN 'book' THEN 'author'
            WHEN 'movie' THEN 'director'
            WHEN 'game' THEN 'developer'
            WHEN 'anime' THEN 'studio'
            WHEN 'manga' THEN 'author'
            WHEN 'tv' THEN 'creator'
            ELSE 'creator'
        END AS role,
        (pos - 1)::integer AS "position"
    FROM "Media" m
    LEFT JOIN "MediaType" mt ON mt.id = m."mediaTypeId",
    LATERAL unnest(string_to_array(m.creator, ', ')) WITH ORDINALITY AS t(elem, pos)
    WHERE m.creator IS NOT NULL
      AND trim(m.creator) <> ''
      AND lower(coalesce(mt.name, '')) <> 'music'
      AND trim(elem) <> ''

    UNION ALL

    -- Music: never split
    SELECT
        m.id AS "mediaId",
        trim(m.creator) AS "name",
        regexp_replace(trim(lower(m.creator)), '\s+', ' ', 'g') AS "nameKey",
        'artist' AS role,
        0::integer AS "position"
    FROM "Media" m
    JOIN "MediaType" mt ON mt.id = m."mediaTypeId"
    WHERE m.creator IS NOT NULL
      AND trim(m.creator) <> ''
      AND lower(mt.name) = 'music'
)
INSERT INTO "MediaCreator" ("mediaId", "creatorId", "role", "position")
SELECT cr."mediaId", c.id, cr.role, cr."position"
FROM creators_raw cr
JOIN "Creator" c ON c."nameKey" = cr."nameKey"
ON CONFLICT ("mediaId", "creatorId", "role") DO NOTHING;

-- Cleanup metadata keys
UPDATE "Media"
SET "metadata" = ("metadata" - 'categories' - 'kind' - 'originalTitle')
WHERE "metadata" IS NOT NULL;
