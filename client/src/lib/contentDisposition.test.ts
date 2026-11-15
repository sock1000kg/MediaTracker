import { describe, expect, it } from "vitest"
import { fallbackExportName, parseContentDispositionFilename } from "./contentDisposition"

describe("parseContentDispositionFilename", () => {
  it("returns null for missing headers or no filename", () => {
    expect(parseContentDispositionFilename(null)).toBeNull()
    expect(parseContentDispositionFilename(undefined)).toBeNull()
    expect(parseContentDispositionFilename("")).toBeNull()
    expect(parseContentDispositionFilename("attachment")).toBeNull()
  })
  it("reads a quoted filename, including escaped quotes", () => {
    expect(parseContentDispositionFilename('attachment; filename="export.csv"')).toBe("export.csv")
    expect(parseContentDispositionFilename('attachment; filename="a \\"b\\".csv"')).toBe('a "b".csv')
  })
  it("reads a bare filename", () => {
    expect(parseContentDispositionFilename("attachment; filename=export.json")).toBe("export.json")
  })
  it("prefers filename* (RFC 5987) and decodes it", () => {
    expect(parseContentDispositionFilename("attachment; filename=\"fallback.csv\"; filename*=UTF-8''caf%C3%A9%20list.csv")).toBe("café list.csv")
  })
  it("falls back to the plain filename when filename* is malformed", () => {
    expect(parseContentDispositionFilename("attachment; filename=\"ok.csv\"; filename*=UTF-8''%E0%A4%A")).toBe("ok.csv")
  })
})

describe("fallbackExportName", () => {
  it("uses the date and extension", () => {
    expect(fallbackExportName("csv", new Date("2026-11-03T10:00:00Z"))).toBe("media-tracker-export-2026-11-03.csv")
  })
})
