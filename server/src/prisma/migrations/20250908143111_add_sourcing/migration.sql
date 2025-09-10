/*
  Warnings:

  - A unique constraint covering the columns `[source,sourceId]` on the table `Media` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."Media" ADD COLUMN     "source" TEXT,
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceRating" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Media_source_sourceId_key" ON "public"."Media"("source", "sourceId");
