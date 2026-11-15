import { JobHandler } from "@/queue/types.js"
import { letterboxdImportService } from "@/services/imports/letterboxdImportService.js"
import { AppError } from "@/api/domain/error.js"

export const letterboxdImportHandler: JobHandler<"import.letterboxd"> = async (ctx) => {
    if (ctx.userId == null) {
        throw new AppError("Import job requires a userId", 400)
    }
    return letterboxdImportService.importFromLetterboxd(
        ctx.userId,
        ctx.payload.files,
        {
            onProgress: async (processed, total) => {
                const pct = total <= 0 ? 100 : Math.floor((processed / total) * 100)
                await ctx.updateProgress(pct)
            },
        }
    )
}
