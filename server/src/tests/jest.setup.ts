// jest.setup.ts
import '@/env.js'
import { assertSafeTestDatabase } from './testDbGuard.js'
import { resetTestData } from './testDb.js'
import { redactUrl } from '@/redactUrl.js'

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
