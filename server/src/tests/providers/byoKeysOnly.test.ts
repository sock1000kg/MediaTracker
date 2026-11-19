import { getUserApiKey, getProviderEntry, ProviderName } from "@/providers/registry.js"
import { prisma } from "@/tests/jest.setup.js"
import { AppError } from "@/api/domain/error.js"

describe("BYO keys only - no env fallback (P1, T1)", () => {
    const keyedProviders: ProviderName[] = ["tmdb", "rawg", "lastfm", "bgg"]
    const dummyUserId = "00000000-0000-0000-0000-000000000000"

    beforeEach(() => {
        // Temporarily set server env vars for all keyed providers
        process.env.TMDB_API_KEY = "env-tmdb-secret"
        process.env.RAWG_API_KEY = "env-rawg-secret"
        process.env.LASTFM_API_KEY = "env-lastfm-secret"
        process.env.BGG_PASSWORD = "env-bgg-secret"
    })

    afterEach(() => {
        delete process.env.TMDB_API_KEY
        delete process.env.RAWG_API_KEY
        delete process.env.LASTFM_API_KEY
        delete process.env.BGG_PASSWORD
    })

    test("registry marks all 4 providers as requiring BYO key with keyService", () => {
        for (const p of keyedProviders) {
            const entry = getProviderEntry(p)
            expect(entry.keyService).toBeTruthy()
        }
    })

    test("getUserApiKey throws 404 when user has no key in DB, ignoring env vars", async () => {
        // Verify user dummy has no key in DB
        await prisma.userAPIKey.deleteMany({
            where: { userId: dummyUserId },
        })

        for (const p of keyedProviders) {
            await expect(getUserApiKey(p, undefined)).rejects.toMatchObject({
                status: 404,
            })

            await expect(getUserApiKey(p, dummyUserId)).rejects.toMatchObject({
                status: 404,
            })
        }
    })
})
