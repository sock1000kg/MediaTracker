import { demoService } from "@/services/demoService.js"
import type { JobHandler } from "@/queue/types.js"

export const demoResetHandler: JobHandler<"demo.reset"> = async () => {
    await demoService.resetDemoUser()
    return null
}
