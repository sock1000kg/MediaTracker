import { prisma } from './jest.setup.mjs'

describe('Database Tests', () => {
    test('should use test database URL', () => {
        expect(process.env.NODE_ENV).toBe('test')
        expect(process.env.DATABASE_URL).toContain('media_tracker_test')
    })

    test('Prisma connects to the database', async () => {
        // Test database connection
        const result = await prisma.$queryRaw`SELECT 1 as test`
        expect(result).toEqual([{ test: 1 }])
    })
})

