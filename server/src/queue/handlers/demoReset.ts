import { demoService } from "@/services/demoService.js"
import { getQueue } from "@/queue/index.js"
import type { JobHandler } from "@/queue/types.js"

export const demoResetHandler: JobHandler<"demo.reset"> = async () => {
    await demoService.resetDemoUser()
    await getQueue().enqueue("music.coverBackfill", {})
    return null
}
