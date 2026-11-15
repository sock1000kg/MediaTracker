-- TV results stored their genres under metadata->'genres', which never became Genre rows
-- (other types use metadata->'categories'). Same backfill as 20261114150000, for TV only.
INSERT INTO "Genre" ("name", "nameKey")
SELECT DISTINCT ON (nameKey) name, nameKey
FROM (
    SELECT
        trim(elem) AS name,
        regexp_replace(trim(lower(elem)), '\s+', ' ', 'g') AS nameKey,
        m.id,
        pos
    FROM "Media" m
    JOIN "MediaType" mt ON mt.id = m."mediaTypeId" AND lower(mt.name) = 'tv',
    LATERAL jsonb_array_elements_text(m.metadata->'genres') WITH ORDINALITY AS t(elem, pos)
    WHERE jsonb_typeof(m.metadata->'genres') = 'array'
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
    FROM "Media" m
    JOIN "MediaType" mt ON mt.id = m."mediaTypeId" AND lower(mt.name) = 'tv',
    LATERAL jsonb_array_elements_text(m.metadata->'genres') WITH ORDINALITY AS t(elem, pos)
    WHERE jsonb_typeof(m.metadata->'genres') = 'array'
      AND trim(elem) <> ''
) sub
JOIN "Genre" g ON g."nameKey" = sub.nameKey
ON CONFLICT ("mediaId", "genreId") DO NOTHING;

UPDATE "Media" m
SET "metadata" = m."metadata" - 'genres'
FROM "MediaType" mt
WHERE mt.id = m."mediaTypeId" AND lower(mt.name) = 'tv'
  AND m."metadata" ? 'genres';
