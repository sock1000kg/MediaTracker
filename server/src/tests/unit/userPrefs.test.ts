import http from "http"
import { toCsv, safeFilenamePart, attachmentHeader } from "@/utilities.js"
import { mergePreferences, preferencesPatchSchema, preferencesSchema, readPreferences } from "@/schemas/userSchemas.js"

const sort = (field: "title" | "creator" | "rating" | "date", direction: "asc" | "desc" = "asc") => ({ field, direction })

describe("preferences merge", () => {
    test("null deletes a key", () => {
        const patch = preferencesPatchSchema.parse({ theme: null })
        expect(mergePreferences({ theme: "dark", defaultTab: "logs" }, patch)).toEqual({ defaultTab: "logs" })
    })

    test("nested objects merge by sub-key", () => {
        const patch = preferencesPatchSchema.parse({ hideLogged: { music: true } })
        expect(mergePreferences({ hideLogged: { books: true } }, patch)).toEqual({ hideLogged: { books: true, music: true } })
    })

    test("anime tab and hideLogged.anime are accepted, unknown keys rejected", () => {
        const patch = preferencesPatchSchema.parse({ defaultTab: "animeSearch", hideLogged: { anime: true } })
        expect(mergePreferences({ hideLogged: { music: true } }, patch)).toEqual({ defaultTab: "animeSearch", hideLogged: { music: true, anime: true } })
        expect(preferencesPatchSchema.safeParse({ hideLogged: { junk: true } }).success).toBe(false)
        expect(readPreferences({ hideLogged: { anime: false, junk: 1 } })).toEqual({ hideLogged: { anime: false } })
    })

    test("gameSearch tab and hideLogged.games are accepted", () => {
        const patch = preferencesPatchSchema.parse({ defaultTab: "gameSearch", hideLogged: { games: true } })
        expect(mergePreferences({ hideLogged: { movies: true } }, patch)).toEqual({ defaultTab: "gameSearch", hideLogged: { movies: true, games: true } })
        expect(preferencesSchema.safeParse({ defaultTab: "gameSearch", hideLogged: { games: false } }).success).toBe(true)
        expect(readPreferences({ defaultTab: "gameSearch", hideLogged: { games: true } })).toEqual({ defaultTab: "gameSearch", hideLogged: { games: true } })
    })

    test("movieSearch tab and hideLogged.movies are accepted", () => {
        const patch = preferencesPatchSchema.parse({ defaultTab: "movieSearch", hideLogged: { movies: true } })
        expect(mergePreferences({ hideLogged: { anime: true } }, patch)).toEqual({ defaultTab: "movieSearch", hideLogged: { anime: true, movies: true } })
        expect(preferencesSchema.safeParse({ defaultTab: "movieSearch", hideLogged: { movies: false } }).success).toBe(true)
        expect(readPreferences({ defaultTab: "movieSearch", hideLogged: { movies: true } })).toEqual({ defaultTab: "movieSearch", hideLogged: { movies: true } })
    })

    test("other keys replace", () => {
        const patch = preferencesPatchSchema.parse({ theme: "light", defaultSort: { logs: [sort("title")] } })
        const out = mergePreferences({ theme: "dark", defaultSort: { medias: [sort("date", "desc")] } }, patch)
        expect(out.theme).toBe("light")
        expect(out.defaultSort).toEqual({ medias: [sort("date", "desc")], logs: [sort("title")] })
    })

    test("rejects unknown keys, bad enums and more than 3 sorts", () => {
        expect(preferencesPatchSchema.safeParse({ foo: 1 }).success).toBe(false)
        expect(preferencesPatchSchema.safeParse({ theme: "purple" }).success).toBe(false)
        expect(preferencesPatchSchema.safeParse({ hideLogged: { other: true } }).success).toBe(false)
        const four = [sort("title"), sort("creator"), sort("rating"), sort("date")]
        expect(preferencesPatchSchema.safeParse({ defaultSort: { logs: four } }).success).toBe(false)
        expect(preferencesSchema.safeParse({ theme: null }).success).toBe(false)
    })
})

describe("readPreferences (lenient)", () => {
    test("drops bad fields and unknown keys, keeps good ones", () => {
        const out = readPreferences({
            theme: "neon", defaultTab: "logs", junk: 1,
            hideLogged: { books: "yes", music: true },
            defaultSort: { logs: [{ field: "nope", direction: "asc" }], medias: [sort("title")] },
        })
        expect(out).toEqual({ defaultTab: "logs", hideLogged: { music: true }, defaultSort: { medias: [sort("title")] } })
    })

    test("non-object stored data gives {}", () => {
        expect(readPreferences(null)).toEqual({})
        expect(readPreferences([1, 2])).toEqual({})
        expect(readPreferences("x")).toEqual({})
    })
})

describe("toCsv", () => {
    const body = (s: string) => s.replace(/^\uFEFF/, "")

    test("BOM, CRLF and trailing newline", () => {
        const s = toCsv([["a", "b"], ["1", "2"]])
        expect(s.startsWith("\uFEFF")).toBe(true)
        expect(body(s)).toBe("a,b\r\n1,2\r\n")
    })

    test("quotes commas, quotes, newlines and edge spaces", () => {
        expect(body(toCsv([["a,b", 'say "hi"', "l1\nl2", " pad", "x\ry"]])))
            .toBe('"a,b","say ""hi""","l1\nl2"," pad","x\ry"\r\n')
    })

    test("null/undefined are empty cells", () => {
        expect(body(toCsv([[null, undefined, "x"]]))).toBe(",,x\r\n")
    })

    test("formula injection prefix on text, not numbers", () => {
        expect(body(toCsv([["=SUM(1)", "+1", "-1", "@x", "\tx"]]))).toBe("'=SUM(1),'+1,'-1,'@x,'\tx\r\n")
        expect(body(toCsv([[-1, 2000]]))).toBe("-1,2000\r\n")
    })
})

describe("export filename", () => {
    test("safeFilenamePart", () => {
        expect(safeFilenamePart("alice")).toBe("alice")
        expect(safeFilenamePart("a.b-c_d")).toBe("a.b-c_d")
        expect(safeFilenamePart('Đạt"Exp')).toMatch(/^[A-Za-z0-9._-]+$/)
        expect(safeFilenamePart("Đạ")).toBe("user")
        expect(safeFilenamePart('""')).toBe("user")
        expect(safeFilenamePart("...")).toBe("user")
        expect(safeFilenamePart("a;b/c\\d")).toMatch(/^[A-Za-z0-9._-]+$/)
    })

    test.each(["alice", 'Đạt"Exp', 'a"b;x', "it's (a)*!", "a;b/c\\d"])("header is valid for %s", (name) => {
        const h = attachmentHeader(`media-tracker-${safeFilenamePart(name)}-2026-01-01.csv`, `media-tracker-${name}-2026-01-01.csv`)
        expect(() => http.validateHeaderValue("Content-Disposition", h)).not.toThrow()
        expect(h).toMatch(/^attachment; filename="[A-Za-z0-9._-]+"; filename\*=UTF-8''[A-Za-z0-9._%-]+$/)
    })

    test("ascii name gives identical plain filename", () => {
        expect(attachmentHeader("media-tracker-alice-2026-01-01.json", "media-tracker-alice-2026-01-01.json"))
            .toBe(`attachment; filename="media-tracker-alice-2026-01-01.json"; filename*=UTF-8''media-tracker-alice-2026-01-01.json`)
    })
})
