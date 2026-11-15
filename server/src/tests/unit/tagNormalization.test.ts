import { normalizeTagName, tagKey, MAX_TAG_LENGTH, MAX_TAGS_PER_LOG, MAX_TAGS_PER_USER } from "@/utilities.js"

describe("Tag Normalization and Limits", () => {
    test("constants have expected values", () => {
        expect(MAX_TAG_LENGTH).toBe(40)
        expect(MAX_TAGS_PER_LOG).toBe(20)
        expect(MAX_TAGS_PER_USER).toBe(500)
    })

    test("normalizeTagName trims and collapses whitespace", () => {
        expect(normalizeTagName("  hello   world  ")).toBe("hello world")
        expect(normalizeTagName("single")).toBe("single")
    })

    test("normalizeTagName strips leading # characters", () => {
        expect(normalizeTagName("#scifi")).toBe("scifi")
        expect(normalizeTagName("###scifi")).toBe("scifi")
        expect(normalizeTagName("  ###  scifi  ")).toBe("scifi")
    })

    test("normalizeTagName keeps internal # if any", () => {
        expect(normalizeTagName("c#")).toBe("c#")
    })

    test("normalizeTagName rejects invalid names", () => {
        expect(normalizeTagName("")).toBeNull()
        expect(normalizeTagName("   ")).toBeNull()
        expect(normalizeTagName("#")).toBeNull()
        expect(normalizeTagName("####")).toBeNull()
        expect(normalizeTagName(null)).toBeNull()
        expect(normalizeTagName(undefined)).toBeNull()
        expect(normalizeTagName(123)).toBeNull()
    })

    test("normalizeTagName rejects names with commas", () => {
        expect(normalizeTagName("sci-fi, fantasy")).toBeNull()
        expect(normalizeTagName(",")).toBeNull()
    })

    test("normalizeTagName enforces length 1-40", () => {
        expect(normalizeTagName("a".repeat(40))).toBe("a".repeat(40))
        expect(normalizeTagName("a".repeat(41))).toBeNull()
    })

    test("tagKey lowercases trimmed normalized name", () => {
        expect(tagKey("Sci-Fi Favorites")).toBe("sci-fi favorites")
    })
})
