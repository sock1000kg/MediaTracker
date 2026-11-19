import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import pg from "pg"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe("Migration 51c Integration Test", () => {
    let client: pg.Client
    const schemaName = "test_scratch_51c_migration"
    const capturedNotices: string[] = []
    const migrationsDir = fs.existsSync(path.resolve(process.cwd(), "src/prisma/migrations"))
        ? path.resolve(process.cwd(), "src/prisma/migrations")
        : path.resolve(__dirname, "../../../src/prisma/migrations")

    beforeAll(async () => {
        const dbUrl = process.env.DATABASE_URL || "postgresql://post:postPass@localhost:5433/mydb_test"
        client = new pg.Client({ connectionString: dbUrl })
        await client.connect()

        client.on("notice", (msg) => {
            if (msg.message) capturedNotices.push(msg.message)
        })

        // 1. Create scratch schema and set search_path
        await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE;`)
        await client.query(`CREATE SCHEMA ${schemaName};`)
        await client.query(`SET search_path TO ${schemaName}, public;`)

        // 2. Apply migrations 1 through 5 (up to 20261118120000_media_details_timestamps)
        const migrationNames = [
            "20261115200000_init_uuid",
            "20261116120000_normalize_log_status",
            "20261117170000_lastfm_caa_covers",
            "20261118100000_media_identity_provider",
            "20261118120000_media_details_timestamps",
        ]

        for (const name of migrationNames) {
            const sqlPath = path.join(migrationsDir, name, "migration.sql")
            const sql = fs.readFileSync(sqlPath, "utf-8")
            await client.query(sql)
        }
    })

    afterAll(async () => {
        if (client) {
            await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE;`)
            await client.end()
        }
    })

    it("empties old refresh tokens, migrates token to tokenHash, casts UserAPIKey service, deletes invalid services, and is idempotent", async () => {
        const userId = "018f0000-0000-7000-8000-000000000001"
        await client.query(
            `INSERT INTO "User" ("id", "username", "password") VALUES ($1, $2, $3)`,
            [userId, "testuser51c", "hashedpass"]
        )

        // Insert old-shape refresh tokens with raw 'token' column
        await client.query(
            `INSERT INTO "RefreshToken" ("id", "token", "userId", "expiresAt", "createdAt") VALUES
             ('018f0000-0000-7000-8000-000000000011', 'raw-token-1', $1, NOW() + INTERVAL '7 days', NOW()),
             ('018f0000-0000-7000-8000-000000000012', 'raw-token-2', $1, NOW() + INTERVAL '7 days', NOW())`,
            [userId]
        )

        // Insert UserAPIKeys with valid and invalid services
        const validServices = ["lastfm", "tmdb", "rawg", "bgg", "google_books"]
        for (let i = 0; i < validServices.length; i++) {
            await client.query(
                `INSERT INTO "UserAPIKey" ("id", "key", "service", "userId") VALUES
                 ($1, $2, $3, $4)`,
                [`018f0000-0000-7000-8000-00000000002${i}`, `key-${validServices[i]}`, validServices[i], userId]
            )
        }

        // Insert invalid service row (e.g. goodreads)
        const invalidKeyId = "018f0000-0000-7000-8000-000000000099"
        await client.query(
            `INSERT INTO "UserAPIKey" ("id", "key", "service", "userId") VALUES
             ($1, $2, $3, $4)`,
            [invalidKeyId, "key-goodreads", "goodreads", userId]
        )

        // Read and apply migration 51c
        const migration51cSql = fs.readFileSync(
            path.join(migrationsDir, "20261118160000_refresh_tokens_api_keys", "migration.sql"),
            "utf-8"
        )
        await client.query(migration51cSql)

        // Check 1: notice raised for invalid service
        expect(capturedNotices.some((n) => n.includes("Deleting UserAPIKey row") && n.includes("goodreads"))).toBe(true)

        // Check 2: RefreshToken table is completely empty (old rows wiped so users re-authenticate)
        const tokenRows = await client.query(`SELECT * FROM "RefreshToken"`)
        expect(tokenRows.rows.length).toBe(0)

        // Check 3: RefreshToken table has tokenHash column and NOT token column
        const tokenCols = await client.query(
            `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'RefreshToken'`,
            [schemaName]
        )
        const colNames = tokenCols.rows.map((r) => r.column_name)
        expect(colNames).toContain("tokenHash")
        expect(colNames).not.toContain("token")

        // Check 4: UserAPIKey has valid enum rows and invalid row was deleted
        const remainingKeys = await client.query(`SELECT "id", "service" FROM "UserAPIKey" WHERE "userId" = $1`, [userId])
        expect(remainingKeys.rows.length).toBe(5)
        const remainingServices = remainingKeys.rows.map((r) => r.service).sort()
        expect(remainingServices).toEqual(["bgg", "google_books", "lastfm", "rawg", "tmdb"])

        // Check 5: UserAPIKey.service udt_name is ApiKeyService
        const serviceColType = await client.query(
            `SELECT udt_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'UserAPIKey' AND column_name = 'service'`,
            [schemaName]
        )
        expect(serviceColType.rows[0].udt_name).toBe("ApiKeyService")

        // Idempotency check:
        // Insert a new RefreshToken with tokenHash
        const newTokenId = "018f0000-0000-7000-8000-000000000088"
        await client.query(
            `INSERT INTO "RefreshToken" ("id", "tokenHash", "userId", "expiresAt", "createdAt") VALUES
             ($1, 'sha256hashvalue', $2, NOW() + INTERVAL '7 days', NOW())`,
            [newTokenId, userId]
        )

        // Run migration 51c second time
        await client.query(migration51cSql)

        // Verify the newly inserted token is STILL present (not deleted!)
        const afterSecondRunTokens = await client.query(`SELECT * FROM "RefreshToken" WHERE "id" = $1`, [newTokenId])
        expect(afterSecondRunTokens.rows.length).toBe(1)
        expect(afterSecondRunTokens.rows[0].tokenHash).toBe("sha256hashvalue")

        // Verify API keys still intact
        const afterSecondRunKeys = await client.query(`SELECT count(*) FROM "UserAPIKey" WHERE "userId" = $1`, [userId])
        expect(Number(afterSecondRunKeys.rows[0].count)).toBe(5)
    })
})
