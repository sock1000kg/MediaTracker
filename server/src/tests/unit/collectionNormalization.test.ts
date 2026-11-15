import {
    normalizeCollectionName,
    collectionKey,
    sanitizeCollectionDescription,
    MAX_COLLECTION_NAME_LENGTH,
    MAX_COLLECTION_DESC_LENGTH,
} from "@/utilities.js"
import {
    createCollectionSchema,
    updateCollectionSchema,
} from "@/schemas/collectionSchemas.js"

describe("collectionNormalization", () => {
    describe("normalizeCollectionName", () => {
        it("trims and collapses whitespace", () => {
            expect(normalizeCollectionName("  My   Favorite    Movies  ")).toBe("My Favorite Movies")
            expect(normalizeCollectionName("\tBest\n  Books\r\n")).toBe("Best Books")
        })

        it("accepts valid names within 1 to 80 characters", () => {
            expect(normalizeCollectionName("A")).toBe("A")
            const longName = "a".repeat(MAX_COLLECTION_NAME_LENGTH)
            expect(normalizeCollectionName(longName)).toBe(longName)
        })

        it("rejects empty, whitespace-only, or too long names", () => {
            expect(normalizeCollectionName("")).toBeNull()
            expect(normalizeCollectionName("   ")).toBeNull()
            expect(normalizeCollectionName("a".repeat(MAX_COLLECTION_NAME_LENGTH + 1))).toBeNull()
        })

        it("rejects non-strings", () => {
            expect(normalizeCollectionName(null)).toBeNull()
            expect(normalizeCollectionName(undefined)).toBeNull()
            expect(normalizeCollectionName(123)).toBeNull()
            expect(normalizeCollectionName({})).toBeNull()
        })
    })

    describe("collectionKey", () => {
        it("lowercases the name for case-insensitive lookup", () => {
            expect(collectionKey("Sci-Fi Classics")).toBe("sci-fi classics")
            expect(collectionKey("ALL CAPS")).toBe("all caps")
        })
    })

    describe("sanitizeCollectionDescription", () => {
        it("trims description and returns null for empty or whitespace", () => {
            expect(sanitizeCollectionDescription("  hello world  ")).toBe("hello world")
            expect(sanitizeCollectionDescription("")).toBeNull()
            expect(sanitizeCollectionDescription("   \n\t  ")).toBeNull()
            expect(sanitizeCollectionDescription(null)).toBeNull()
            expect(sanitizeCollectionDescription(undefined)).toBeNull()
        })

        it("preserves descriptions up to 1000 characters", () => {
            const desc = "d".repeat(MAX_COLLECTION_DESC_LENGTH)
            expect(sanitizeCollectionDescription(desc)).toBe(desc)
        })
    })

    describe("collectionSchemas", () => {
        it("updateCollectionSchema does not wipe omitted description", () => {
            const parsedRanked = updateCollectionSchema.parse({ ranked: true })
            expect(parsedRanked).toEqual({ ranked: true })
            expect(parsedRanked.description).toBeUndefined()

            const parsedName = updateCollectionSchema.parse({ name: "New Name" })
            expect(parsedName).toEqual({ name: "New Name" })
            expect(parsedName.description).toBeUndefined()
        })

        it("updateCollectionSchema allows clearing description with null or empty string", () => {
            expect(updateCollectionSchema.parse({ description: null })).toEqual({ description: null })
            expect(updateCollectionSchema.parse({ description: "" })).toEqual({ description: null })
            expect(updateCollectionSchema.parse({ description: "   " })).toEqual({ description: null })
        })

        it("createCollectionSchema defaults description to null when omitted", () => {
            const created = createCollectionSchema.parse({ name: "New Col" })
            expect(created).toEqual({ name: "New Col", description: null, ranked: false })
        })
    })
})
