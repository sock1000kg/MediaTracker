import { backfillMusicCovers, backfillMusicData } from "@/services/musicCoverBackfillService.js"
import type { JobHandler } from "@/queue/types.js"

export const musicCoverBackfillHandler: JobHandler<"music.coverBackfill"> = async (ctx) => {
    const r1 = await backfillMusicCovers(undefined, (pct) => ctx.updateProgress(Math.floor(pct / 2)))
    const r2 = await backfillMusicData(undefined, (pct) => ctx.updateProgress(50 + Math.floor(pct / 2)))
    return { processed: r1.processed + r2.processed, updated: r1.updated + r2.updated }
}
