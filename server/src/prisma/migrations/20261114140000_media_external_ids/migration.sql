-- CreateTable
CREATE TABLE "MediaExternalId" (
    "id" SERIAL NOT NULL,
    "mediaId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaExternalId_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaExternalId_provider_externalId_key" ON "MediaExternalId"("provider", "externalId");

-- CreateIndex
CREATE INDEX "MediaExternalId_mediaId_idx" ON "MediaExternalId"("mediaId");

-- AddForeignKey
ALTER TABLE "MediaExternalId" ADD CONSTRAINT "MediaExternalId_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill notice on duplicates across titles
DO $$
DECLARE
    dup RECORD;
BEGIN
    FOR dup IN
        SELECT source as provider, "sourceId" as external_id, string_agg(id::text, ', ' ORDER BY id) as media_ids
        FROM "Media"
        WHERE "sourceId" IS NOT NULL AND source IS NOT NULL
        GROUP BY source, "sourceId"
        HAVING count(DISTINCT id) > 1
    LOOP
        RAISE NOTICE 'Duplicate external id for provider %, id % across Media ids: %', dup.provider, dup.external_id, dup.media_ids;
    END LOOP;
END $$;

-- Backfill 1: every Media with a sourceId -> (source, sourceId) verbatim, keeping lower id on conflict
INSERT INTO "MediaExternalId" ("mediaId", "provider", "externalId", "created_at")
SELECT id, LOWER(source), "sourceId", created_at
FROM "Media"
WHERE "sourceId" IS NOT NULL AND source IS NOT NULL
ORDER BY id ASC
ON CONFLICT ("provider", "externalId") DO NOTHING;

-- Backfill 2: every Media whose metadata->'idMal' is a number -> ('mal', that number as text), keeping lower id on conflict
INSERT INTO "MediaExternalId" ("mediaId", "provider", "externalId", "created_at")
SELECT id, 'mal', (metadata->>'idMal'), created_at
FROM "Media"
WHERE metadata IS NOT NULL
  AND metadata ? 'idMal'
  AND (metadata->>'idMal') ~ '^[0-9]+$'
ORDER BY id ASC
ON CONFLICT ("provider", "externalId") DO NOTHING;
