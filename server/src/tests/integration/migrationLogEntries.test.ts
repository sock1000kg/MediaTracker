import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import pg from "pg"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const MIGRATION = "20261120140000_log_entries"

describe("Migration: log entries", () => {
    let client: pg.Client
    const schemaName = "test_scratch_log_entries_migration"
    const notices: string[] = []
    const migrationsDir = fs.existsSync(path.resolve(process.cwd(), "src/prisma/migrations"))
        ? path.resolve(process.cwd(), "src/prisma/migrations")
        : path.resolve(__dirname, "../../../src/prisma/migrations")
    const sql = () => fs.readFileSync(path.join(migrationsDir, MIGRATION, "migration.sql"), "utf-8")

    beforeAll(async () => {
        const dbUrl = process.env.DATABASE_URL || "postgresql://post:postPass@localhost:5433/mydb_test"
        client = new pg.Client({ connectionString: dbUrl })
        await client.connect()
        client.on("notice", (msg) => { if (msg.message) notices.push(msg.message) })

        await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE;`)
        await client.query(`CREATE SCHEMA ${schemaName};`)
        await client.query(`SET search_path TO ${schemaName}, public;`)

        // Every migration before this one: the database as the last release left it
        const earlier = fs.readdirSync(migrationsDir)
            .filter((n) => /^\d+_/.test(n) && n < MIGRATION)
            .sort()
        for (const name of earlier) {
            await client.query(fs.readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf-8"))
        }
    })

    afterAll(async () => {
        if (client) {
            await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE;`)
            await client.end()
        }
    })

    it("turns dates and progress into one entry per log, leaves wishlist logs without one, drops the old columns, and is idempotent", async () => {
        const userId = "018f0000-0000-7000-8000-000000000a01"
        const typeId = "018f0000-0000-7000-8000-000000000a02"
        await client.query(`INSERT INTO "User" ("id", "username", "password") VALUES ($1, 'entries_user', 'x')`, [userId])
        await client.query(`INSERT INTO "MediaType" ("id", "name") VALUES ($1, 'anime')`, [typeId])

        const media = [0, 1, 2, 3].map((i) => `018f0000-0000-7000-8000-000000000b0${i}`)
        for (const [i, id] of media.entries()) {
            await client.query(
                `INSERT INTO "Media" ("id", "title", "userId", "mediaTypeId", "provider", "providerId") VALUES ($1, $2, $3, $4, $5, $6)`,
                [id, `Item ${i}`, userId, typeId, i === 3 ? "goodreads" : null, i === 3 ? "gr-1" : null]
            )
        }
        // dates + progress / progress only / nothing (wishlist) / dates only
        const logs = [
            ["018f0000-0000-7000-8000-000000000c00", media[0], "2024-01-10 12:00:00", "2024-03-23 12:00:00", 28],
            ["018f0000-0000-7000-8000-000000000c01", media[1], null, null, 7],
            ["018f0000-0000-7000-8000-000000000c02", media[2], null, null, null],
            ["018f0000-0000-7000-8000-000000000c03", media[3], null, "2023-05-05 12:00:00", null],
        ]
        for (const [id, mediaId, start, finish, ep] of logs) {
            await client.query(
                `INSERT INTO "UserLogs" ("id", "userId", "mediaId", "started_at", "finished_at", "progressEpisodes") VALUES ($1, $2, $3, $4, $5, $6)`,
                [id, userId, mediaId, start, finish, ep]
            )
        }
        await client.query(`UPDATE "Media" SET "syncCheckedAt" = NOW() WHERE "id" = $1`, [media[3]])

        await client.query(sql())

        const entries = await client.query(`SELECT "logId", "startedAt"::text AS s, "finishedAt"::text AS f, "progressEpisodes" AS ep FROM "LogEntry" ORDER BY "logId"`)
        expect(entries.rows).toEqual([
            { logId: logs[0][0], s: "2024-01-10", f: "2024-03-23", ep: 28 },
            { logId: logs[1][0], s: null, f: null, ep: 7 },
            { logId: logs[3][0], s: null, f: "2023-05-05", ep: null },
        ])
        // the wishlist log has none
        const none = await client.query(`SELECT 1 FROM "LogEntry" WHERE "logId" = $1`, [logs[2][0]])
        expect(none.rowCount).toBe(0)
        expect(notices.some((n) => n.includes("4 logs, 3 entries created, 1 logs without entries"))).toBe(true)

        // the old columns are gone, the new one is there
        const cols = await client.query(
            `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'UserLogs'`,
            [schemaName]
        )
        const names = cols.rows.map((r) => r.column_name)
        for (const gone of ["started_at", "finished_at", "progressEpisodes", "progressChapters", "progressVolumes"]) {
            expect(names).not.toContain(gone)
        }
        expect(names).toContain("title")

        // Goodreads rows get re-checked by the next sync
        const gr = await client.query(`SELECT "syncCheckedAt" FROM "Media" WHERE "id" = $1`, [media[3]])
        expect(gr.rows[0].syncCheckedAt).toBeNull()

        // a second run is a no-op
        await client.query(sql())
        const after = await client.query(`SELECT COUNT(*)::int AS n FROM "LogEntry"`)
        expect(after.rows[0].n).toBe(3)
    })
})
