-- DropForeignKey
ALTER TABLE "public"."MediaType" DROP CONSTRAINT "MediaType_userId_fkey";

-- AlterTable
ALTER TABLE "public"."MediaType" ALTER COLUMN "userId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."MediaType" ADD CONSTRAINT "MediaType_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
