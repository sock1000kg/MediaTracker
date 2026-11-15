-- CreateTable
CREATE TABLE "Collection" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "description" TEXT,
    "ranked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionItem" (
    "collectionId" INTEGER NOT NULL,
    "logId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionItem_pkey" PRIMARY KEY ("collectionId","logId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Collection_userId_nameKey_key" ON "Collection"("userId", "nameKey");

-- CreateIndex
CREATE INDEX "CollectionItem_logId_idx" ON "CollectionItem"("logId");

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_logId_fkey" FOREIGN KEY ("logId") REFERENCES "UserLogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
