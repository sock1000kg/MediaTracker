-- DropForeignKey
ALTER TABLE "public"."Media" DROP CONSTRAINT "Media_mediaTypeId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Media" DROP CONSTRAINT "Media_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."MediaType" DROP CONSTRAINT "MediaType_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."UserLogs" DROP CONSTRAINT "UserLogs_mediaId_fkey";

-- DropForeignKey
ALTER TABLE "public"."UserLogs" DROP CONSTRAINT "UserLogs_userId_fkey";

-- AddForeignKey
ALTER TABLE "public"."Media" ADD CONSTRAINT "Media_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Media" ADD CONSTRAINT "Media_mediaTypeId_fkey" FOREIGN KEY ("mediaTypeId") REFERENCES "public"."MediaType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MediaType" ADD CONSTRAINT "MediaType_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserLogs" ADD CONSTRAINT "UserLogs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserLogs" ADD CONSTRAINT "UserLogs_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "public"."Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
