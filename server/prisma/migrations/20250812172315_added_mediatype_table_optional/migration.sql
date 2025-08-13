/*
  Warnings:

  - You are about to drop the column `type` on the `Media` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Media" DROP COLUMN "type",
ADD COLUMN     "mediaTypeId" INTEGER;

-- CreateTable
CREATE TABLE "public"."MediaType" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "MediaType_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."Media" ADD CONSTRAINT "Media_mediaTypeId_fkey" FOREIGN KEY ("mediaTypeId") REFERENCES "public"."MediaType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MediaType" ADD CONSTRAINT "MediaType_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
