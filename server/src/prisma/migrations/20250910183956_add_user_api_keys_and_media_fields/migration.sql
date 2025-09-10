-- DropIndex
DROP INDEX "public"."Media_source_sourceId_key";

-- AlterTable
ALTER TABLE "public"."Media" ADD COLUMN     "description" TEXT,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "ratingsCount" INTEGER;

-- CreateTable
CREATE TABLE "public"."UserAPIKey" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    "mediaTypeId" INTEGER,

    CONSTRAINT "UserAPIKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserAPIKey_userId_service_mediaTypeId_key" ON "public"."UserAPIKey"("userId", "service", "mediaTypeId");

-- AddForeignKey
ALTER TABLE "public"."UserAPIKey" ADD CONSTRAINT "UserAPIKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserAPIKey" ADD CONSTRAINT "UserAPIKey_mediaTypeId_fkey" FOREIGN KEY ("mediaTypeId") REFERENCES "public"."MediaType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
