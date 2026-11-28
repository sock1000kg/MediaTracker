import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import pg from "pg"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const MIGRATION = "20261120180000_entry_names"

describe("Migration: entry names", () => {
    let client: pg.Client
    const schemaName = "test_scratch_entry_names_migration"
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

    it("edition titles become entry names, a log title moves to the newest unnamed entry, a title with no entries is dropped, and a second run is a no-op", async () => {
        const userId = "018f0000-0000-7000-8000-000000000d01"
        const typeId = "018f0000-0000-7000-8000-000000000d02"
        await client.query(`INSERT INTO "User" ("id", "username", "password") VALUES ($1, 'names_user', 'x')`, [userId])
        await client.query(`INSERT INTO "MediaType" ("id", "name") VALUES ($1, 'book')`, [typeId])

        const media = [0, 1, 2, 3].map((i) => `018f0000-0000-7000-8000-000000000e0${i}`)
        for (const [i, id] of media.entries()) {
            await client.query(`INSERT INTO "Media" ("id", "title", "userId", "mediaTypeId") VALUES ($1, $2, $3, $4)`, [id, `Item ${i}`, userId, typeId])
        }
        const logs = [0, 1, 2, 3].map((i) => `018f0000-0000-7000-8000-000000000f0${i}`)
        // 0: edition titles on two entries; no log title
        // 1: a log title, two entries (the newest has no name) -> goes to the newest
        // 2: a log title, but the newest entry already has a name -> the entry keeps its name
        // 3: a log title and no entries -> dropped
        const titles = [null, "Mon étranger", "Ignored", "Orphan title"]
        for (const [i, id] of logs.entries()) {
            await client.query(`INSERT INTO "UserLogs" ("id", "userId", "mediaId", "title") VALUES ($1, $2, $3, $4)`, [id, userId, media[i], titles[i]])
        }
        const entry = (n: number) => `018f0000-0000-7000-8000-0000000010${String(n).padStart(2, "0")}`
        const rows: [number, string, string | null, string | null, string | null][] = [
            // id, logId, finishedAt, edition json, (unused)
            [1, logs[0], "2024-05-05", JSON.stringify({ title: "L'étranger", format: "Paperback" }), null],
            [2, logs[0], "2022-02-02", JSON.stringify({ title: "The Stranger" }), null],
            [3, logs[1], "2020-01-01", null, null],
            [4, logs[1], "2024-01-01", JSON.stringify({ format: "Kindle" }), null],
            [5, logs[2], "2024-01-01", JSON.stringify({ title: "Named by edition" }), null],
            [6, logs[2], "2020-01-01", null, null],
        ]
        for (const [n, logId, finished, edition] of rows) {
            await client.query(`INSERT INTO "LogEntry" ("id", "logId", "finishedAt", "edition") VALUES ($1, $2, $3, $4::jsonb)`, [entry(n), logId, finished, edition])
        }

        await client.query(sql())

        const out = await client.query(`SELECT "id", "name", "edition" FROM "LogEntry" ORDER BY "id"`)
        const byId = Object.fromEntries(out.rows.map((r) => [r.id, r]))
        expect(byId[entry(1)]).toMatchObject({ name: "L'étranger", edition: { format: "Paperback" } })
        expect(byId[entry(2)]).toMatchObject({ name: "The Stranger", edition: null }) // nothing left in the edition: NULL
        expect(byId[entry(3)].name).toBeNull()
        expect(byId[entry(4)]).toMatchObject({ name: "Mon étranger", edition: { format: "Kindle" } }) // the log title moved to the newest entry
        expect(byId[entry(5)].name).toBe("Named by edition") // the newest entry already had a name
        expect(byId[entry(6)].name).toBeNull()
        expect(out.rows.some((r) => r.edition && "title" in r.edition)).toBe(false)

        const cols = await client.query(
            `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'UserLogs'`,
            [schemaName]
        )
        expect(cols.rows.map((r) => r.column_name)).not.toContain("title")
        expect(notices.some((n) => n.includes("3 entries named from edition titles"))).toBe(true)
        expect(notices.some((n) => n.includes("1 log titles moved") && n.includes("1 log titles dropped"))).toBe(true)

        // a second run changes nothing
        const before = JSON.stringify(out.rows)
        await client.query(sql())
        const again = await client.query(`SELECT "id", "name", "edition" FROM "LogEntry" ORDER BY "id"`)
        expect(JSON.stringify(again.rows)).toBe(before)
    })
})
