import { backfillMusicCovers, backfillMusicData } from "@/services/musicCoverBackfillService.js"
import { syncOpenLibraryBooks } from "@/services/openLibrarySyncService.js"

export type BackfillTarget = "music" | "openlibrary" | "all"
export const BACKFILL_TARGETS: readonly BackfillTarget[] = ["music", "openlibrary", "all"]

export function parseBackfillTarget(arg: string | undefined): BackfillTarget {
    if (arg === undefined) return "all"
    if ((BACKFILL_TARGETS as readonly string[]).includes(arg)) return arg as BackfillTarget
    throw new Error(`Unknown backfill target "${arg}". Use one of: ${BACKFILL_TARGETS.join(", ")}`)
}

export interface BackfillCounts {
    processed: number
    updated: number
}

// Runs the same service functions the queue jobs use, directly. Each one works through every pending row.
export async function runBackfill(
    target: BackfillTarget,
    log: (line: string) => void = console.log
): Promise<Record<string, BackfillCounts>> {
    const results: Record<string, BackfillCounts> = {}

    if (target === "music" || target === "all") {
        const covers = await backfillMusicCovers()
        const data = await backfillMusicData()
        results.music = {
            processed: covers.processed + data.processed,
            updated: covers.updated + data.updated,
        }
        log(`music: processed ${results.music.processed}, updated ${results.music.updated}`)
    }

    if (target === "openlibrary" || target === "all") {
        results.openlibrary = await syncOpenLibraryBooks()
        log(`openlibrary: processed ${results.openlibrary.processed}, updated ${results.openlibrary.updated}`)
    }

    return results
}
