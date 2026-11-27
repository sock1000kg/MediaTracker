-- CreateTable
CREATE TABLE "SealedLetter" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "logId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "opensAt" TIMESTAMP(3),
    "opensOnRelog" BOOLEAN NOT NULL DEFAULT false,
    "openedAt" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SealedLetter_pkey" PRIMARY KEY ("id"),
    -- Exactly one way to open: a date, or the next time the item is logged
    CONSTRAINT "SealedLetter_one_condition" CHECK (("opensAt" IS NOT NULL) <> "opensOnRelog")
);

-- CreateIndex
CREATE INDEX "SealedLetter_userId_openedAt_idx" ON "SealedLetter"("userId", "openedAt");

-- CreateIndex
CREATE INDEX "SealedLetter_logId_idx" ON "SealedLetter"("logId");

-- AddForeignKey
ALTER TABLE "SealedLetter" ADD CONSTRAINT "SealedLetter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SealedLetter" ADD CONSTRAINT "SealedLetter_logId_fkey" FOREIGN KEY ("logId") REFERENCES "UserLogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
