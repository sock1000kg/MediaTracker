-- CreateTable
CREATE TABLE "Tag" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogTag" (
    "logId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,

    CONSTRAINT "LogTag_pkey" PRIMARY KEY ("logId","tagId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tag_userId_nameKey_key" ON "Tag"("userId", "nameKey");

-- CreateIndex
CREATE INDEX "LogTag_tagId_idx" ON "LogTag"("tagId");

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogTag" ADD CONSTRAINT "LogTag_logId_fkey" FOREIGN KEY ("logId") REFERENCES "UserLogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogTag" ADD CONSTRAINT "LogTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
