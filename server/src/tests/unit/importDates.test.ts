import { parseImportDate, toDayPrecision } from "@/utilities.js"
import { importedLogDate } from "@/services/imports/goodreadsImportService.js"

describe("parseImportDate", () => {
    test("parses Goodreads YYYY/MM/DD", () => {
        expect(parseImportDate("2023/04/17")?.toISOString().slice(0, 10)).toBe("2023-04-17")
    })
    test("parses ISO dates and timestamps", () => {
        expect(parseImportDate("2021-02-03")?.toISOString().slice(0, 10)).toBe("2021-02-03")
        expect(parseImportDate("2021-02-03T10:00:00Z")?.toISOString()).toBe("2021-02-03T10:00:00.000Z")
    })
    test("rejects invalid, impossible and missing values", () => {
        for (const v of ["", "garbage", "2023/13/01", "2023/02/30", "17/04/2023", "2023/4/7", undefined, null, 5, "2023-02-03Tnope"]) {
            expect(parseImportDate(v)).toBeNull()
        }
    })
})

describe("toDayPrecision", () => {
    test("normalizes YYYY-MM-DD and YYYY/MM/DD to noon UTC", () => {
        expect(toDayPrecision("2026-11-13")?.toISOString()).toBe("2026-11-13T12:00:00.000Z")
        expect(toDayPrecision("2023/04/17")?.toISOString()).toBe("2023-04-17T12:00:00.000Z")
    })
    test("normalizes Date objects to noon UTC on same UTC calendar day", () => {
        const d = new Date(Date.UTC(2026, 4, 10, 3, 25, 0))
        expect(toDayPrecision(d)?.toISOString()).toBe("2026-05-10T12:00:00.000Z")
    })
    test("returns null for invalid or empty inputs", () => {
        for (const v of ["", "   ", "garbage", "2023-02-30", "2023-13-01", null, undefined, 123]) {
            expect(toDayPrecision(v)).toBeNull()
        }
    })
})

describe("importedLogDate", () => {
    test("Date Added wins over Date Read", () => {
        expect(importedLogDate({ "Date Read": "2023/04/17", "Date Added": "2022/01/01" })?.toISOString().slice(0, 10)).toBe("2022-01-01")
    })
    test("Date Read is the fallback when Date Added is missing or invalid", () => {
        expect(importedLogDate({ "Date Read": "2023/04/17" })?.toISOString().slice(0, 10)).toBe("2023-04-17")
        expect(importedLogDate({ "Date Added": "nope", "Date Read": "2023/04/17" })?.toISOString().slice(0, 10)).toBe("2023-04-17")
    })
    test("both missing or invalid gives null (now)", () => {
        expect(importedLogDate({})).toBeNull()
        expect(importedLogDate({ "Date Read": "x", "Date Added": "y" })).toBeNull()
    })
})
