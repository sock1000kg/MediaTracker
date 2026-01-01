/*
  Warnings:

  - A unique constraint covering the columns `[userId,creator,title,year,mediaTypeId,source]` on the table `Media` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."Media_userId_creator_title_year_mediaTypeId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Media_userId_creator_title_year_mediaTypeId_source_key" ON "public"."Media"("userId", "creator", "title", "year", "mediaTypeId", "source");
