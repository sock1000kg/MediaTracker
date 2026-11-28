-- Set Last.fm media imageUrl to Cover Art Archive URL if mbid is known (metadata->>'mbid' or UUID sourceId), else NULL
UPDATE "Media"
SET "imageUrl" = CASE
  WHEN (metadata->>'mbid') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN 'https://coverartarchive.org/release/' || (metadata->>'mbid') || '/front-250'
  WHEN "sourceId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN 'https://coverartarchive.org/release/' || "sourceId" || '/front-250'
  ELSE NULL
END
WHERE "source" = 'lastfm'
  AND ("imageUrl" LIKE '%lastfm%fastly.net%' OR "imageUrl" LIKE '%lastfm.freetls.fastly.net%' OR "imageUrl" LIKE '%last.fm%');
