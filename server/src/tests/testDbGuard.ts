import { redactUrl } from "../redactUrl.js"

const ALLOWED_HOSTS = new Set([
    "localhost",
    "127.0.0.1",
    "::1",
    "[::1]",
    "postgres",
    "database_test",
])

export function assertSafeTestDatabase(env: Record<string, string | undefined> = process.env): void {
    if (env.NODE_ENV !== "test") {
        throw new Error(
            `Refusing to run tests: NODE_ENV must be "test" (got ${JSON.stringify(env.NODE_ENV)}). Database: ${redactUrl(env.DATABASE_URL)}`
        )
    }

    if (!env.DATABASE_URL || !env.DATABASE_URL.trim()) {
        throw new Error("Refusing to run tests: DATABASE_URL is not defined")
    }

    let parsedUrl: URL
    try {
        parsedUrl = new URL(env.DATABASE_URL.trim())
    } catch {
        throw new Error(`Refusing to run tests: DATABASE_URL is unparseable: ${redactUrl(env.DATABASE_URL)}`)
    }

    const rawPath = parsedUrl.pathname.replace(/^\/+/, "")
    const dbName = decodeURIComponent(rawPath)

    if (!dbName || !dbName.endsWith("_test")) {
        throw new Error(
            `Refusing to run tests: database name ${JSON.stringify(dbName)} does not end with "_test". Database: ${redactUrl(env.DATABASE_URL)}`
        )
    }

    const hostname = parsedUrl.hostname.toLowerCase()
    if (!ALLOWED_HOSTS.has(hostname) && env.ALLOW_REMOTE_TEST_DB !== "1") {
        throw new Error(
            `Refusing to run tests against non-local host ${JSON.stringify(hostname)}. Set ALLOW_REMOTE_TEST_DB=1 to override. Database: ${redactUrl(env.DATABASE_URL)}`
        )
    }
}
