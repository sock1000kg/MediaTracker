import { assertSafeTestDatabase } from '../testDbGuard.js'

describe('assertSafeTestDatabase', () => {
    const SECRET = 'SUPER_SECRET_P4SSW0RD'

    it('passes for valid local test databases', () => {
        expect(() => assertSafeTestDatabase({
            NODE_ENV: 'test',
            DATABASE_URL: `postgresql://user:${SECRET}@localhost:5434/mydb_test`,
        })).not.toThrow()

        expect(() => assertSafeTestDatabase({
            NODE_ENV: 'test',
            DATABASE_URL: `postgresql://user:${SECRET}@127.0.0.1:5432/x_test?schema=public`,
        })).not.toThrow()

        expect(() => assertSafeTestDatabase({
            NODE_ENV: 'test',
            DATABASE_URL: `postgresql://user:${SECRET}@postgres:5432/ci_test`,
        })).not.toThrow()

        expect(() => assertSafeTestDatabase({
            NODE_ENV: 'test',
            DATABASE_URL: `postgresql://user:${SECRET}@database_test:5432/app_test`,
        })).not.toThrow()

        expect(() => assertSafeTestDatabase({
            NODE_ENV: 'test',
            DATABASE_URL: `postgresql://user:${SECRET}@[::1]:5432/ipv6_test`,
        })).not.toThrow()
    })

    it('fails when NODE_ENV is not test', () => {
        expect(() => assertSafeTestDatabase({
            NODE_ENV: 'development',
            DATABASE_URL: `postgresql://user:${SECRET}@localhost:5434/mydb_test`,
        })).toThrow(/NODE_ENV must be "test"/)

        expect(() => assertSafeTestDatabase({
            NODE_ENV: undefined,
            DATABASE_URL: `postgresql://user:${SECRET}@localhost:5434/mydb_test`,
        })).toThrow(/NODE_ENV must be "test"/)
    })

    it('fails when DATABASE_URL is missing or empty', () => {
        expect(() => assertSafeTestDatabase({
            NODE_ENV: 'test',
            DATABASE_URL: '',
        })).toThrow(/DATABASE_URL is not defined/)

        expect(() => assertSafeTestDatabase({
            NODE_ENV: 'test',
            DATABASE_URL: undefined,
        })).toThrow(/DATABASE_URL is not defined/)
    })

    it('fails when DATABASE_URL is unparseable', () => {
        expect(() => assertSafeTestDatabase({
            NODE_ENV: 'test',
            DATABASE_URL: 'not-a-valid-url',
        })).toThrow(/DATABASE_URL is unparseable/)
    })

    it.each([
        ['mydb', 'postgresql://user:pass@localhost:5434/mydb'],
        ['mydb_testing', 'postgresql://user:pass@localhost:5434/mydb_testing'],
        ['test_mydb', 'postgresql://user:pass@localhost:5434/test_mydb'],
        ['root slash only', 'postgresql://user:pass@localhost:5434/'],
    ])('fails when database name does not end with _test (%s)', (_label, url) => {
        expect(() => assertSafeTestDatabase({
            NODE_ENV: 'test',
            DATABASE_URL: url,
        })).toThrow(/does not end with "_test"/)
    })

    it('fails for remote host without ALLOW_REMOTE_TEST_DB=1, but passes with it', () => {
        const remoteEnv = {
            NODE_ENV: 'test',
            DATABASE_URL: `postgresql://user:${SECRET}@db.example.com:5432/mydb_test`,
        }

        expect(() => assertSafeTestDatabase(remoteEnv)).toThrow(/non-local host "db.example.com"/)

        expect(() => assertSafeTestDatabase({
            ...remoteEnv,
            ALLOW_REMOTE_TEST_DB: '1',
        })).not.toThrow()
    })

    it('never prints the database password in error messages', () => {
        const testCases = [
            { NODE_ENV: 'development', DATABASE_URL: `postgresql://user:${SECRET}@localhost:5434/mydb_test` },
            { NODE_ENV: 'test', DATABASE_URL: `postgresql://user:${SECRET}@localhost:5434/production_db` },
            { NODE_ENV: 'test', DATABASE_URL: `postgresql://user:${SECRET}@db.example.com:5432/mydb_test` },
        ]

        for (const env of testCases) {
            try {
                assertSafeTestDatabase(env)
                throw new Error('Expected assertSafeTestDatabase to throw')
            } catch (err: unknown) {
                const message = (err as Error).message
                expect(message).not.toContain(SECRET)
                expect(message).toContain('***')
            }
        }
    })
})
