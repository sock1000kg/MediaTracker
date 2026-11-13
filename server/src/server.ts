import app from '@/app.js'
import { redactUrl } from '@/redactUrl.js'
import { getQueue, registerAllHandlers } from '@/queue/index.js'

const PORT: number = Number(process.env.PORT) || 5000

if (process.env.NODE_ENV !== 'test') {
    registerAllHandlers()
    await getQueue().start()
    // Idempotent across restarts and instances; weekly demo reset (Sunday 00:00)
    await getQueue().schedule("demo-reset-weekly", "0 0 * * 0", "demo.reset", {}, { attempts: 3, backoffMs: 60_000 })

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
                process.exit(0)
            } catch (e) {
                console.error("Error closing queue", e)
                process.exit(1)
            }
        })
        server.closeIdleConnections?.()
    }
    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))
}
