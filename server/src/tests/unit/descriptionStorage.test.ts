import { createMediaAndLogSchema } from "@/schemas/search/searchSchemas.js"
import { isStoredAsReceived } from "@/providers/registry.js"

const payload = (source: string, description: string) => ({
    mediaData: { title: "T", mediaType: source === "bgg" ? "boardgame" : "game", source, sourceId: "1", description },
    logData: { status: "wishlist" },
})

describe("storage rule from the registry", () => {
    test("only BGG is stored as received", () => {
        expect(isStoredAsReceived("bgg")).toBe(true)
        expect(isStoredAsReceived("rawg")).toBe(false)
        expect(isStoredAsReceived("tmdb")).toBe(false)
        expect(isStoredAsReceived(null)).toBe(false)
    })

    test("a BGG description is stored as received (trimmed, never truncated); a RAWG one is sanitized (capped)", () => {
        const long = `  ${"x".repeat(4000)}  `
        const bgg = createMediaAndLogSchema.parse(payload("bgg", long))
        const rawg = createMediaAndLogSchema.parse(payload("rawg", long))
        expect(bgg.mediaData.description).toBe("x".repeat(4000))
        expect(rawg.mediaData.description).toBe("x".repeat(3000))
    })
})
