import { openLibrarySyncService } from "@/services/openLibrarySyncService.js"
import prisma from "@/prismaClient.js"
import type { JobHandler } from "@/queue/types.js"

export const openLibrarySyncHandler: JobHandler<"openlibrary.sync"> = async (ctx) => {
    return openLibrarySyncService.syncOpenLibraryBooks(prisma, ctx.updateProgress)
}
