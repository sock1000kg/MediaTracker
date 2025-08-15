-- AlterTable
ALTER TABLE "public"."Media" ADD COLUMN     "userId" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."Media" ADD CONSTRAINT "Media_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
