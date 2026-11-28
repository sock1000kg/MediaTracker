import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import zlib from "node:zlib"
import {
    parseMalExport,
    mapMalStatus,
    mapMalScore,
    parseMalDate,
    parseMalTags,
    decompressMalExport,
    isGzip,
    MAX_XML_SIZE,
} from "@/services/imports/malImportService.js"
import { AppError } from "@/api/domain/error.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe("MyAnimeList Import (Unit)", () => {
    const fixturesDir = path.resolve(__dirname, "../fixtures/mal")
    const validAnimeXml = fs.readFileSync(path.join(fixturesDir, "valid-anime.xml"))
    const validMangaXml = fs.readFileSync(path.join(fixturesDir, "valid-manga.xml"))
    const notMalXml = fs.readFileSync(path.join(fixturesDir, "invalid-not-mal.xml"))

    describe("Anime and Manga Detection", () => {
        it("detects anime export correctly from user_export_type or anime tag", () => {
            const parsed = parseMalExport(validAnimeXml)
            expect(parsed.exportType).toBe("anime")
            expect(parsed.entries.length).toBe(2)
            expect(parsed.entries[0].watchedEpisodes).toBe(28)
        })

        it("detects manga export correctly from user_export_type or manga tag", () => {
            const parsed = parseMalExport(validMangaXml)
            expect(parsed.exportType).toBe("manga")
            expect(parsed.entries.length).toBe(1)
            expect(parsed.entries[0].title).toBe("Berserk")
            expect(parsed.entries[0].readChapters).toBe(364)
            expect(parsed.entries[0].readVolumes).toBe(41)
        })

        it("rejects a file that is not a MAL export with a clear 400 error", () => {
            expect(() => parseMalExport(notMalXml)).toThrow(AppError)
            try {
                parseMalExport(notMalXml)
            } catch (e: unknown) {
                const err = e as AppError
                expect(err.status).toBe(400)
                expect(err.message).toBe("This doesn't look like a MyAnimeList export")
            }
        })
    })

    describe("CDATA titles, special characters and non-ASCII text", () => {
        it("preserves &, <, > and non-ASCII characters in CDATA titles", () => {
            const parsed = parseMalExport(validAnimeXml)
            const first = parsed.entries[0]
            expect(first.title).toBe("Frieren & Friends <Beyond> 葬送")
            expect(first.comments).toBe("Beautiful adventure")
        })

        it("decodes standard XML entities (&amp;, &lt;, &gt;, &apos;, &quot;) outside CDATA", () => {
            const xmlWithEntities = `<?xml version="1.0" encoding="UTF-8" ?>
<myanimelist>
    <myinfo>
        <user_id>12345</user_id>
        <user_name>testuser</user_name>
        <user_export_type>1</user_export_type>
    </myinfo>
    <anime>
        <series_animedb_id>100</series_animedb_id>
        <series_title>Spice &amp; Wolf</series_title>
        <series_type>TV</series_type>
        <series_episodes>12</series_episodes>
        <my_watched_episodes>12</my_watched_episodes>
        <my_score>10</my_score>
        <my_status>Completed</my_status>
        <my_comments>Loved the &apos;economics&apos; &amp; &lt;dialogue&gt;</my_comments>
        <my_tags>romance &amp; trade, fantasy &lt;adventure&gt;</my_tags>
    </anime>
</myanimelist>`
            const parsed = parseMalExport(Buffer.from(xmlWithEntities))
            const entry = parsed.entries[0]
            expect(entry.title).toBe("Spice & Wolf")
            expect(entry.comments).toBe("Loved the 'economics' & <dialogue>")
            expect(entry.tags).toEqual(["romance & trade", "fantasy <adventure>"])
        })
        it("rejects a file that declares a DOCTYPE or ENTITY", () => {
            const xml = `<?xml version="1.0"?><!DOCTYPE myanimelist [<!ENTITY x "boom">]><myanimelist><myinfo><user_export_type>1</user_export_type></myinfo><anime><series_title>&x;</series_title></anime></myanimelist>`
            expect(() => parseMalExport(Buffer.from(xml))).toThrow("This doesn't look like a MyAnimeList export")
        })

    })

    describe("Status Mapping", () => {
        it("maps Completed to Completed", () => {
            expect(mapMalStatus("Completed")).toBe("completed")
            expect(mapMalStatus("completed")).toBe("completed")
        })

        it("maps Watching and Reading to In progress", () => {
            expect(mapMalStatus("Watching")).toBe("in progress")
            expect(mapMalStatus("Reading")).toBe("in progress")
        })

        it("maps On-Hold to In progress", () => {
            expect(mapMalStatus("On-Hold")).toBe("in progress")
            expect(mapMalStatus("on-hold")).toBe("in progress")
        })

        it("maps Dropped to Dropped", () => {
            expect(mapMalStatus("Dropped")).toBe("dropped")
        })

        it("maps Plan to Watch and Plan to Read to Wishlist", () => {
            expect(mapMalStatus("Plan to Watch")).toBe("wishlist")
            expect(mapMalStatus("Plan to Read")).toBe("wishlist")
        })

        it("throws an AppError for an unknown status", () => {
            expect(() => mapMalStatus("UnknownStatus")).toThrow(AppError)
            expect(() => mapMalStatus("Random")).toThrow(/Unknown MAL status: Random/)
        })
    })

    describe("Score / Rating Rules", () => {
        it("maps score 0 or empty to null (unrated, not 0)", () => {
            expect(mapMalScore("0")).toBeNull()
            expect(mapMalScore(0)).toBeNull()
            expect(mapMalScore("")).toBeNull()
            expect(mapMalScore(null)).toBeNull()
            expect(mapMalScore(undefined)).toBeNull()
        })

        it("maps score 1–10 to score * 10 (scale 100)", () => {
            expect(mapMalScore("7")).toBe(70)
            expect(mapMalScore(7)).toBe(70)
            expect(mapMalScore("10")).toBe(100)
            expect(mapMalScore("1")).toBe(10)
        })
    })

    describe("Date Rules", () => {
        it("maps 0000-00-00 to null", () => {
            expect(parseMalDate("0000-00-00")).toBeNull()
        })

        it("maps partial date 2019-00-00 to the first day of that year (UTC noon)", () => {
            const d = parseMalDate("2019-00-00")
            expect(d).not.toBeNull()
            expect(d!.toISOString()).toBe("2019-01-01T12:00:00.000Z")
        })

        it("maps partial date 2019-05-00 to the first day of that month (UTC noon)", () => {
            const d = parseMalDate("2019-05-00")
            expect(d).not.toBeNull()
            expect(d!.toISOString()).toBe("2019-05-01T12:00:00.000Z")
        })

        it("maps full date to exact date (UTC noon)", () => {
            const d = parseMalDate("2024-03-23")
            expect(d).not.toBeNull()
            expect(d!.toISOString()).toBe("2024-03-23T12:00:00.000Z")
        })
    })

    describe("Tags Splitting", () => {
        it("splits tags on commas, trims whitespace and drops empty values", () => {
            expect(parseMalTags("fantasy, adventure, masterpiece")).toEqual([
                "fantasy",
                "adventure",
                "masterpiece",
            ])
            expect(parseMalTags("  one ,  , two,   three  ")).toEqual(["one", "two", "three"])
            expect(parseMalTags("")).toEqual([])
            expect(parseMalTags(null)).toEqual([])
        })
    })

    describe("Gzip Handling and Limits", () => {
        it("correctly identifies gzip magic bytes", () => {
            const gzipped = zlib.gzipSync(validAnimeXml)
            expect(isGzip(gzipped)).toBe(true)
            expect(isGzip(validAnimeXml)).toBe(false)
        })

        it("a .gz file and plain .xml give the identical parsed result", () => {
            const gzipped = zlib.gzipSync(validAnimeXml)
            const plainParsed = parseMalExport(validAnimeXml)
            const gzParsed = parseMalExport(gzipped)
            expect(gzParsed).toEqual(plainParsed)
        })

        it("enforces decompressed-size limit and guards against gzip bombs", () => {
            // Buffer larger than 10MB
            const hugeBuffer = Buffer.alloc(MAX_XML_SIZE + 1024, "a")
            expect(() => decompressMalExport(hugeBuffer)).toThrow(AppError)

            // Gzip bomb (small compressed file that inflates past 10MB)
            const gzippedBomb = zlib.gzipSync(hugeBuffer)
            expect(() => decompressMalExport(gzippedBomb)).toThrow(AppError)
            try {
                decompressMalExport(gzippedBomb)
            } catch (e: unknown) {
                const err = e as AppError
                expect(err.status).toBe(400)
                expect(err.message).toContain("max 10 MB")
            }
        })
    })
})
