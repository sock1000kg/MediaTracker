import '@/env.js'
import app from '@/app.js'
import prisma from '@/prismaClient.js'
import { redactUrl } from '@/redactUrl.js'
import { getQueue, registerAllHandlers } from '@/queue/index.js'

const PORT: number = Number(process.env.PORT) || 5000

if (process.env.NODE_ENV !== 'test') {
    registerAllHandlers()
    await getQueue().start()
    // Idempotent across restarts and instances; weekly demo reset (Sunday 00:00)
    await getQueue().schedule("demo-reset-weekly", "0 0 * * 0", "demo.reset", {}, { attempts: 3, backoffMs: 60_000 })
    // Daily TMDB data refresh (at 03:00)
    await getQueue().schedule("tmdb-refresh-daily", "0 3 * * *", "tmdb.refresh", {}, { attempts: 3, backoffMs: 60_000 })
    // One-off backfills (music, Open Library) no longer run on boot: `npm run backfill`

    const server = app.listen(PORT, () => {
        console.log(`Server has started on port: ${PORT}, DB_URL: ${redactUrl(process.env.DATABASE_URL)}`)
    })

    let shuttingDown = false
    const shutdown = (signal: string) => {
        if (shuttingDown) return
        shuttingDown = true
        console.log(`${signal} received, shutting down`)
        const hardTimeout = setTimeout(() => {
            console.error("Shutdown timed out, forcing exit")
            process.exit(1)
        }, 10_000)
        hardTimeout.unref()
        server.close(async () => {
            try {
                await getQueue().close()
                await prisma.$disconnect()
                process.exit(0)
            } catch (e) {
                console.error("Error during graceful shutdown", e)
                process.exit(1)
            }
        })
        server.closeIdleConnections?.()
    }
    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))
}
