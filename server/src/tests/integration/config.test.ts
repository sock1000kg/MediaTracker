import request from "supertest"
import app from "@/app.js"
import { publicConfigSchema } from "@/schemas/configSchemas.js"

describe("GET /config", () => {
    it("returns 200 without authentication, with Cache-Control header and correct user-facing limits", async () => {
        // A developer's server/.env may turn the demo card on; this test checks the default.
        const savedPublicDemo = process.env.PUBLIC_DEMO
        delete process.env.PUBLIC_DEMO
        const res = await request(app).get("/config")
        if (savedPublicDemo !== undefined) process.env.PUBLIC_DEMO = savedPublicDemo

        expect(res.status).toBe(200)
        expect(res.headers["cache-control"]).toBe("no-cache")

        // Conforms to shared Zod schema
        const parsed = publicConfigSchema.safeParse(res.body)
        expect(parsed.success).toBe(true)

        // Exact documented values
        expect(res.body.limits).toEqual({
            notes: {
                maxLength: 50_000,
            },
            logs: {
                maxEntriesPerLog: 100,
                entryNoteMaxLength: 10_000,
                entryNameMaxLength: 300,
            },
            tags: {
                maxLength: 40,
                maxPerLog: 20,
                maxPerUser: 500,
            },
            collections: {
                nameMaxLength: 80,
                descMaxLength: 1000,
                maxPerUser: 200,
                maxItemsPerCollection: 1000,
            },
            imports: {
                maxFileBytes: 10 * 1024 * 1024,
            },
            search: {
                queryMaxLength: 100,
            },
        })

        // Server internals must not be exposed to the public
        const limits = res.body.limits as Record<string, unknown>
        expect(limits.queue).toBeUndefined()
        expect(limits.apiKeys).toBeUndefined()
        expect(limits.prefs).toBeUndefined()
        const imports = limits.imports as Record<string, unknown>
        expect(imports.maxFailures).toBeUndefined()
        expect(imports.malMaxEntries).toBeUndefined()
        expect(imports.letterboxdUnpackedEntryBytes).toBeUndefined()
        expect(imports.letterboxdUnpackedTotalBytes).toBeUndefined()

        // demo is null when PUBLIC_DEMO is not enabled
        expect(res.body.demo).toBeNull()
    })

    describe("demo credentials exposure", () => {
        const originalPublicDemo = process.env.PUBLIC_DEMO
        const originalDemoPassword = process.env.DEMO_USER_PASSWORD

        afterEach(() => {
            if (originalPublicDemo === undefined) {
                delete process.env.PUBLIC_DEMO
            } else {
                process.env.PUBLIC_DEMO = originalPublicDemo
            }
            if (originalDemoPassword === undefined) {
                delete process.env.DEMO_USER_PASSWORD
            } else {
                process.env.DEMO_USER_PASSWORD = originalDemoPassword
            }
        })

        it("returns demo: { username, password } only when PUBLIC_DEMO=true and DEMO_USER_PASSWORD is set", async () => {
            process.env.PUBLIC_DEMO = "true"
            process.env.DEMO_USER_PASSWORD = "super-secret-demo-pass"

            const res = await request(app).get("/config")
            expect(res.status).toBe(200)
            expect(res.body.demo).toEqual({
                username: "demo",
                password: "super-secret-demo-pass",
            })
        })

        it("returns demo: null when PUBLIC_DEMO is true but DEMO_USER_PASSWORD is not set or empty", async () => {
            process.env.PUBLIC_DEMO = "true"
            delete process.env.DEMO_USER_PASSWORD

            const res = await request(app).get("/config")
            expect(res.status).toBe(200)
            expect(res.body.demo).toBeNull()

            process.env.DEMO_USER_PASSWORD = ""
            const resEmpty = await request(app).get("/config")
            expect(resEmpty.status).toBe(200)
            expect(resEmpty.body.demo).toBeNull()
        })

        it("returns demo: null when PUBLIC_DEMO is not 'true' even if DEMO_USER_PASSWORD is set", async () => {
            process.env.DEMO_USER_PASSWORD = "super-secret-demo-pass"

            delete process.env.PUBLIC_DEMO
            const resNotSet = await request(app).get("/config")
            expect(resNotSet.status).toBe(200)
            expect(resNotSet.body.demo).toBeNull()

            process.env.PUBLIC_DEMO = "false"
            const resFalse = await request(app).get("/config")
            expect(resFalse.status).toBe(200)
            expect(resFalse.body.demo).toBeNull()
        })
    })
})
