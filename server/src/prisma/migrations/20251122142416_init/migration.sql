-- CreateTable
CREATE TABLE "public"."User" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "password" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Media" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "creator" TEXT,
    "year" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,
    "sourceId" TEXT,
    "description" TEXT,
    "imageUrl" TEXT,
    "userId" INTEGER,
    "mediaTypeId" INTEGER,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MediaType" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER,

    CONSTRAINT "MediaType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserLogs" (
    "id" SERIAL NOT NULL,
    "status" TEXT,
    "rating" DOUBLE PRECISION,
    "notes" TEXT,
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    "mediaId" INTEGER NOT NULL,

    CONSTRAINT "UserLogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserAPIKey" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "UserAPIKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "public"."User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "MediaType_userId_name_key" ON "public"."MediaType"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "UserLogs_userId_mediaId_key" ON "public"."UserLogs"("userId", "mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "UserAPIKey_userId_service_key" ON "public"."UserAPIKey"("userId", "service");

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

-- AddForeignKey
ALTER TABLE "public"."UserAPIKey" ADD CONSTRAINT "UserAPIKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
