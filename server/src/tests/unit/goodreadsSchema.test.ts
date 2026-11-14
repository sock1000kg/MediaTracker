import { goodreadsRowSchema } from "@/schemas/imports/goodReadsSchemas.js"

const row = (rating: unknown, pages?: unknown) =>
    goodreadsRowSchema.safeParse({
        Title: "T",
        Author: "A",
        "Book Id": "1",
        "My Rating": rating,
        ...(pages !== undefined ? { "Number of Pages": pages } : {}),
    })

describe("goodreadsRowSchema My Rating", () => {
    test("empty and non-numeric become 0 (unrated)", () => {
        for (const v of ["", "abc", undefined, null]) {
            const r = row(v)
            expect(r.success).toBe(true)
            expect(r.success && r.data["My Rating"]).toBe(0)
        }
    })
    test("valid numbers pass through", () => {
        const r = row(4)
        expect(r.success && r.data["My Rating"]).toBe(4)
    })
    test("out-of-range numbers still fail", () => {
        expect(row(6).success).toBe(false)
        expect(row(-1).success).toBe(false)
    })
})

describe("goodreadsRowSchema Number of Pages", () => {
    test("empty, non-numeric, zero, negative are ignored (undefined)", () => {
        for (const v of ["", "abc", undefined, null, 0, -5, "0", "-10", "xyz"]) {
            const r = row(5, v)
            expect(r.success).toBe(true)
            expect(r.success && r.data["Number of Pages"]).toBeUndefined()
        }
    })
    test("positive numbers or numeric strings pass through as numbers", () => {
        expect(row(5, 320).data?.["Number of Pages"]).toBe(320)
        expect(row(5, "450").data?.["Number of Pages"]).toBe(450)
    })
})
