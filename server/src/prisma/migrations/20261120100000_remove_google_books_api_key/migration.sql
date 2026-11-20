-- Google Books support was removed: drop the enum value (and any keys stored for it).
-- Existing media rows and external ids that mention google_books are kept (old data).
DELETE FROM "UserAPIKey" WHERE "service"::text = 'google_books';

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'ApiKeyService' AND e.enumlabel = 'google_books'
    ) THEN
        ALTER TYPE "ApiKeyService" RENAME TO "ApiKeyService_old";
        CREATE TYPE "ApiKeyService" AS ENUM ('lastfm', 'tmdb', 'rawg', 'bgg');
        ALTER TABLE "UserAPIKey"
            ALTER COLUMN "service" TYPE "ApiKeyService" USING "service"::text::"ApiKeyService";
        DROP TYPE "ApiKeyService_old";
    END IF;
END $$;
