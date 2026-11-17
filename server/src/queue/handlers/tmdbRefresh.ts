import { refreshStaleTmdbMedia } from "@/services/tmdbRefreshService.js"
import type { JobHandler } from "@/queue/types.js"

export const tmdbRefreshHandler: JobHandler<"tmdb.refresh"> = async () => {
    return await refreshStaleTmdbMedia()
}
