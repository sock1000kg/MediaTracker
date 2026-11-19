-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ApiKeyService" AS ENUM ('lastfm', 'tmdb', 'rawg', 'bgg', 'google_books');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. RefreshToken: delete all existing rows if "token" column exists, then drop "token" and add "tokenHash"
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'RefreshToken' AND column_name = 'token'
    ) THEN
        DELETE FROM "RefreshToken";
        ALTER TABLE "RefreshToken" DROP COLUMN "token";
    END IF;
END $$;

ALTER TABLE "RefreshToken" ADD COLUMN IF NOT EXISTS "tokenHash" TEXT;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'RefreshToken' AND column_name = 'tokenHash' AND is_nullable = 'YES'
    ) THEN
        ALTER TABLE "RefreshToken" ALTER COLUMN "tokenHash" SET NOT NULL;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- 2. UserAPIKey: convert "service" column to ApiKeyService enum
DO $$
DECLARE
    invalid_count INTEGER;
    r RECORD;
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'UserAPIKey' AND column_name = 'service' AND udt_name != 'ApiKeyService'
    ) THEN
        SELECT COUNT(*) INTO invalid_count
        FROM "UserAPIKey"
        WHERE "service" NOT IN ('lastfm', 'tmdb', 'rawg', 'bgg', 'google_books');

        IF invalid_count > 0 THEN
            FOR r IN
                SELECT "id", "userId", "service"
                FROM "UserAPIKey"
                WHERE "service" NOT IN ('lastfm', 'tmdb', 'rawg', 'bgg', 'google_books')
            LOOP
                RAISE NOTICE 'Deleting UserAPIKey row % with invalid service: %', r.id, r.service;
            END LOOP;
            DELETE FROM "UserAPIKey"
            WHERE "service" NOT IN ('lastfm', 'tmdb', 'rawg', 'bgg', 'google_books');
        END IF;

        ALTER TABLE "UserAPIKey" ALTER COLUMN "service" TYPE "ApiKeyService" USING ("service"::"ApiKeyService");
    END IF;
END $$;
