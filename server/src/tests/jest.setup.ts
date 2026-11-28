// jest.setup.ts
import '@/env.js'
import { jest } from '@jest/globals'
import { assertSafeTestDatabase } from './testDbGuard.js'
import { resetTestData } from './testDb.js'
import { redactUrl } from '@/redactUrl.js'

jest.setTimeout(30000)

// Tests never reach real providers: an unmocked request fails at once instead of hitting the
// provider (and risking a ban) or hanging on a slow network. Mock fetch or the service instead.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])
const realFetch = globalThis.fetch
const blockedRequests: string[] = []
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString())
    if (!LOCAL_HOSTS.has(url.hostname)) {
        blockedRequests.push(url.origin + url.pathname)
        throw new Error(`Test tried to reach ${url.origin}. Mock the request instead.`)
    }
    return realFetch(input, init)
}) as typeof fetch

// Import Prisma dynamically after env is loaded
const { PrismaPg } = await import('@prisma/adapter-pg')
const { PrismaClient } = await import('@/db.js')
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

beforeAll(async () => {
    assertSafeTestDatabase(process.env)
    console.log('Using database:', redactUrl(process.env.DATABASE_URL))

    await prisma.$connect()
    await resetTestData(prisma)
})

afterEach(async () => {
})

afterAll(async () => {
    // Code that swallows request errors would otherwise hide a missing mock
    if (blockedRequests.length > 0) {
        throw new Error(`Tests tried to reach real providers:\n${[...new Set(blockedRequests)].join("\n")}`)
    }
    try {
        const appPrisma = (await import('@/prismaClient.js')).default
        await appPrisma.$disconnect().catch(() => undefined)
    } catch { /* ignore */ }
    await prisma.$disconnect().catch(() => undefined)
    try {
        const { getQueue, resetQueueForTests } = await import('@/queue/index.js')
        await getQueue().close().catch(() => undefined)
        resetQueueForTests()
    } catch { /* ignore */ }
})

export { prisma }
