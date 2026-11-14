import { JobHandler } from "@/queue/types.js"
import { malImportService } from "@/services/imports/malImportService.js"
import { AppError } from "@/api/domain/error.js"

export const malImportHandler: JobHandler<"import.mal"> = async (ctx) => {
    if (ctx.userId == null) {
        throw new AppError("Import job requires a userId", 400)
    }
    return malImportService.importFromMal(
        ctx.userId,
        Buffer.from(ctx.payload.xml, "utf8"),
        {
            onProgress: async (processed, total) => {
                const pct = total <= 0 ? 100 : Math.floor((processed / total) * 100)
                await ctx.updateProgress(pct)
            },
        }
    )
}
