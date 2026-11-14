import { describe, expect, it } from "@jest/globals"
import { zipSync, strToU8 } from "fflate"
import {
    unzipLetterboxdExport,
    mergeLetterboxdFiles,
    normalizeLetterboxdUri,
    MAX_UNPACKED_ENTRY_SIZE,
} from "@/services/imports/letterboxdImportService.js"
import { AppError } from "@/api/domain/error.js"

describe("Letterboxd parser and unzipper", () => {
    describe("normalizeLetterboxdUri", () => {
        it("strips scheme and trailing slashes", () => {
            expect(normalizeLetterboxdUri("https://boxd.it/2bJc")).toBe("boxd.it/2bJc")
            expect(normalizeLetterboxdUri("http://boxd.it/2bJc/")).toBe("boxd.it/2bJc")
            expect(normalizeLetterboxdUri("https://letterboxd.com/film/inception/")).toBe("letterboxd.com/film/inception")
            expect(normalizeLetterboxdUri("boxd.it/2bJc")).toBe("boxd.it/2bJc")
        })
    })

    describe("mergeLetterboxdFiles", () => {
        it("merges a film in watched + ratings + diary + reviews into one row", () => {
            const watchedCsv = [
                "Date,Name,Year,Letterboxd URI",
                "2024-01-10,Inception,2010,https://boxd.it/1sXg",
            ].join("\n")

            const ratingsCsv = [
                "Date,Name,Year,Letterboxd URI,Rating",
                "2024-01-12,Inception,2010,https://boxd.it/1sXg,3.5",
            ].join("\n")

            const diaryCsv = [
                "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date",
                "2024-01-10,Inception,2010,https://boxd.it/d1,3,No,cinema,2024-01-10",
                "2024-06-15,Inception,2010,https://boxd.it/d2,3.5,Yes,\"cinema, 2024\",2024-06-15",
            ].join("\n")

            const reviewsCsv = [
                "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date,Review",
                "2024-06-15,Inception,2010,https://boxd.it/r1,3.5,Yes,\"cinema, 2024\",2024-06-15,\"Mind-bending masterpiece.\"",
            ].join("\n")

            const merged = mergeLetterboxdFiles({
                watched: watchedCsv,
                ratings: ratingsCsv,
                diary: diaryCsv,
                reviews: reviewsCsv,
            })

            expect(merged).toHaveLength(1)
            const film = merged[0]
            expect(film.name).toBe("Inception")
            expect(film.year).toBe(2010)
            expect(film.status).toBe("completed")
            expect(film.rating).toBe(70) // 3.5 * 20
            expect(film.finishedAt).toEqual(new Date(Date.UTC(2024, 5, 15, 12))) // 2024-06-15 noon UTC
            expect(film.loggedAt).toEqual(new Date(Date.UTC(2024, 0, 10, 12))) // earliest Date: 2024-01-10
            expect(film.notes).toBe("Mind-bending masterpiece.")
            expect(film.tags).toEqual(["cinema", "2024"])
            expect(film.progress).toEqual({ watches: 2 })
            expect(film.filmUri).toBe("boxd.it/1sXg")
        })

        it("makes a watchlist-only film wishlist with no rating or finishedAt", () => {
            const watchlistCsv = [
                "Date,Name,Year,Letterboxd URI",
                "2024-03-01,Dune: Part Two,2024,https://boxd.it/n0sC",
            ].join("\n")

            const merged = mergeLetterboxdFiles({
                watchlist: watchlistCsv,
            })

            expect(merged).toHaveLength(1)
            const film = merged[0]
            expect(film.name).toBe("Dune: Part Two")
            expect(film.year).toBe(2024)
            expect(film.status).toBe("wishlist")
            expect(film.rating).toBeNull()
            expect(film.finishedAt).toBeNull()
            expect(film.loggedAt).toEqual(new Date(Date.UTC(2024, 2, 1, 12)))
            expect(film.filmUri).toBe("boxd.it/n0sC")
            expect(film.progress).toBeNull()
        })

        it("handles diary-only film (no film URI) coming through with no letterboxd id", () => {
            const diaryCsv = [
                "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date",
                "2024-04-05,Obscure Indie Film,2022,https://boxd.it/diary_entry_xyz,4,No,\"festival, indies\",2024-04-05",
            ].join("\n")

            const merged = mergeLetterboxdFiles({
                diary: diaryCsv,
            })

            expect(merged).toHaveLength(1)
            const film = merged[0]
            expect(film.name).toBe("Obscure Indie Film")
            expect(film.year).toBe(2022)
            expect(film.status).toBe("completed")
            expect(film.rating).toBe(80) // 4 * 20
            expect(film.finishedAt).toEqual(new Date(Date.UTC(2024, 3, 5, 12)))
            expect(film.filmUri).toBeNull()
            expect(film.tags).toEqual(["festival", "indies"])
            expect(film.progress).toBeNull()
        })
    })

    describe("unzipLetterboxdExport", () => {
        it("unzips valid archive created with fflate.zipSync", () => {
            const zipBytes = zipSync({
                "watched.csv": strToU8("Date,Name,Year,Letterboxd URI\n2024-01-01,Arrival,2016,https://boxd.it/bW9S\n"),
                "ratings.csv": strToU8("Date,Name,Year,Letterboxd URI,Rating\n2024-01-01,Arrival,2016,https://boxd.it/bW9S,5\n"),
                "profile.csv": strToU8("Username,Given Name\ntestuser,Test\n"), // Should be ignored
            })

            const files = unzipLetterboxdExport(Buffer.from(zipBytes))
            expect(files.watched).toContain("Arrival")
            expect(files.ratings).toContain("Arrival")
            expect(files.watchlist).toBeUndefined()
            expect(files.diary).toBeUndefined()
            expect(files.reviews).toBeUndefined()
        })

        it("rejects ZIP with only profile.csv with the 'doesn\\'t look like' message", () => {
            const zipBytes = zipSync({
                "profile.csv": strToU8("Username,Given Name\ntestuser,Test\n"),
            })

            expect(() => unzipLetterboxdExport(Buffer.from(zipBytes))).toThrow(
                "This doesn't look like a Letterboxd export (no watched/ratings/diary/watchlist CSV found)"
            )
        })

        it("rejects non-ZIP buffer with the 'doesn\\'t look like' message", () => {
            expect(() => unzipLetterboxdExport(Buffer.from("not a zip file content"))).toThrow(
                "This doesn't look like a Letterboxd export (no watched/ratings/diary/watchlist CSV found)"
            )
        })

        it("rejects an entry whose declared originalSize is over 10 MB", () => {
            // Craft a zip header or mock UnzipFileInfo with declared originalSize > 10 MB
            const zipBytes = zipSync({
                "watched.csv": strToU8("Date,Name,Year,Letterboxd URI\n"),
            })
            // Find and modify the uncompressed size field in local file header
            // Local file header: offset 0 is signature 0x04034b50
            // Offset 22: uncompressed size (4 bytes, little endian)
            const modified = Buffer.from(zipBytes)
            const signature = Buffer.from([0x50, 0x4b, 0x03, 0x04])
            const headerIdx = modified.indexOf(signature)
            expect(headerIdx).toBeGreaterThanOrEqual(0)
            // Central directory header also has uncompressed size at offset 24
            const cdSignature = Buffer.from([0x50, 0x4b, 0x01, 0x02])
            const cdIdx = modified.indexOf(cdSignature)
            expect(cdIdx).toBeGreaterThanOrEqual(0)

            const hugeSize = MAX_UNPACKED_ENTRY_SIZE + 1024
            modified.writeUInt32LE(hugeSize, headerIdx + 22)
            modified.writeUInt32LE(hugeSize, cdIdx + 24)

            expect(() => unzipLetterboxdExport(modified)).toThrow(
                new AppError("File is too large (max 10 MB unpacked)", 400)
            )
        })
    })
})
