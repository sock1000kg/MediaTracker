import { goodreadsImportService } from "@/services/imports/goodreadsImportService.js"
import { getQueue } from "@/queue/index.js"
import type { JobHandler } from "@/queue/types.js"

export const goodreadsImportHandler: JobHandler<"import.goodreads"> = async (ctx) => {
    if (ctx.userId == null) throw new Error("Import job has no user")
    const result = await goodreadsImportService.importFromGoodReads(
        ctx.userId,
        Buffer.from(ctx.payload.csv, "utf8"),
        { onProgress: (processed, total) => ctx.updateProgress(total <= 0 ? 100 : Math.floor((processed / total) * 100)) },
    )
    await getQueue().enqueue("openlibrary.sync", {})
    return result
}
