/*
  Warnings:

  - A unique constraint covering the columns `[userId,name]` on the table `MediaType` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "MediaType_userId_name_key" ON "public"."MediaType"("userId", "name");
