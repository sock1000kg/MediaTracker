import request from "supertest"
import app from "@/app.js"
import { publicConfigSchema } from "@/schemas/configSchemas.js"

describe("GET /config", () => {
    it("returns 200 without authentication, with Cache-Control header and correct user-facing limits", async () => {
        const res = await request(app).get("/config")

        expect(res.status).toBe(200)
        expect(res.headers["cache-control"]).toBe("public, max-age=3600")

        // Conforms to shared Zod schema
        const parsed = publicConfigSchema.safeParse(res.body)
        expect(parsed.success).toBe(true)

        // Exact documented values
        expect(res.body.limits).toEqual({
            notes: {
                maxLength: 50_000,
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
    })
})
