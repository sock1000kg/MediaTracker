import { describe, expect, it } from "@jest/globals"
import { zipSync, strToU8 } from "fflate"
import {
    unzipLetterboxdExport,
    mergeLetterboxdFiles,
    normalizeLetterboxdUri,
    parseLetterboxdList,
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
        })

        it("a likes-only film comes through as completed", () => {
            const likesCsv = "Date,Name,Year,Letterboxd URI\n2025-08-10,Creep,2014,https://boxd.it/7l4c\n"
            const merged = mergeLetterboxdFiles({
                likes: likesCsv,
            })
            expect(merged).toHaveLength(1)
            const film = merged[0]
            expect(film.name).toBe("Creep")
            expect(film.year).toBe(2014)
            expect(film.status).toBe("completed")
            expect(film.rating).toBeNull()
            expect(film.filmUri).toBe("boxd.it/7l4c")
            expect(film.liked).toBe(true)
        })

        it("a liked film that's also rated keeps its rating", () => {
            const ratingsCsv = "Date,Name,Year,Letterboxd URI,Rating\n2025-06-27,Whiplash,2014,https://boxd.it/7bQA,4.5\n"
            const likesCsv = "Date,Name,Year,Letterboxd URI\n2025-06-27,Whiplash,2014,https://boxd.it/7bQA\n"
            const merged = mergeLetterboxdFiles({
                ratings: ratingsCsv,
                likes: likesCsv,
            })
            expect(merged).toHaveLength(1)
            const film = merged[0]
            expect(film.name).toBe("Whiplash")
            expect(film.year).toBe(2014)
            expect(film.status).toBe("completed")
            expect(film.rating).toBe(90) // 4.5 * 20
            expect(film.liked).toBe(true)
        })

        it("a film only in a list comes through as wishlist", () => {
            const listCsv = [
                "Letterboxd list export v7",
                "Date,Name,Tags,URL,Description",
                "2024-05-01,Favorite Films,,https://boxd.it/l1,Great films",
                "",
                "Position,Name,Year,URL",
                "1,Stalker,1979,https://boxd.it/1848",
            ].join("\n")

            const merged = mergeLetterboxdFiles({
                lists: [{ fileName: "lists/favorites.csv", text: listCsv }],
            })

            expect(merged).toHaveLength(1)
            const film = merged[0]
            expect(film.name).toBe("Stalker")
            expect(film.year).toBe(1979)
            expect(film.status).toBe("wishlist")
            expect(film.inLists).toBe(true)
            expect(film.onlyInLists).toBe(true)
            expect(film.rating).toBeNull()
            expect(film.finishedAt).toBeNull()
            expect(film.filmUri).toBe("boxd.it/1848")
        })

        it("a film in watched and in a list keeps completed status", () => {
            const watchedCsv = "Date,Name,Year,Letterboxd URI\n2024-01-01,Inception,2010,https://boxd.it/1sXg\n"
            const listCsv = [
                "Letterboxd list export v7",
                "Date,Name,Tags,URL,Description",
                "2024-05-01,Favorites,,https://boxd.it/l1,Desc",
                "",
                "Position,Name,Year,URL",
                "1,Inception,2010,https://boxd.it/1sXg",
            ].join("\n")

            const merged = mergeLetterboxdFiles({
                watched: watchedCsv,
                lists: [{ fileName: "lists/favs.csv", text: listCsv }],
            })

            expect(merged).toHaveLength(1)
            const film = merged[0]
            expect(film.name).toBe("Inception")
            expect(film.status).toBe("completed")
            expect(film.inLists).toBe(true)
            expect(film.onlyInLists).toBe(false)
        })
    })

    describe("unzipLetterboxdExport", () => {
        it("unzips likes/films.csv while ignoring other likes files", () => {
            const zipBytes = zipSync({
                "watched.csv": strToU8("Date,Name,Year,Letterboxd URI\n2024-01-01,Arrival,2016,https://boxd.it/bW9S\n"),
                "likes/films.csv": strToU8("Date,Name,Year,Letterboxd URI\n2025-06-27,Whiplash,2014,https://boxd.it/7bQA\n"),
                "likes/reviews.csv": strToU8("Date,Review\n"),
                "likes/lists.csv": strToU8("Date,List\n"),
            })

            const files = unzipLetterboxdExport(Buffer.from(zipBytes))
            expect(files.watched).toContain("Arrival")
            expect(files.likes).toContain("Whiplash")
        })
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

        it("unzips lists/*.csv (one level, .csv only) and returns them in files.lists", () => {
            const zipBytes = zipSync({
                "watched.csv": strToU8("Date,Name,Year,Letterboxd URI\n2024-01-01,Arrival,2016,https://boxd.it/bW9S\n"),
                "lists/top10.csv": strToU8("Date,Name,Tags,URL,Description\n2024-01-01,Top 10,,,\n\nPosition,Name,Year,URL\n1,Arrival,2016,https://boxd.it/bW9S\n"),
                "lists/favorites.csv": strToU8("Date,Name,Tags,URL,Description\n2024-01-01,Favorites,,,\n\nPosition,Name,Year,URL\n1,Arrival,2016,https://boxd.it/bW9S\n"),
                "likes/lists.csv": strToU8("Date,Name,URL\n2024-01-01,Ignored List,https://boxd.it/l\n"),
                "lists/nested/sub.csv": strToU8("Date,Name,Tags,URL,Description\n2024-01-01,Sub,,,\n\nPosition,Name,Year,URL\n1,Arrival,2016,https://boxd.it/bW9S\n"),
                "lists/readme.txt": strToU8("some notes"),
            })

            const files = unzipLetterboxdExport(Buffer.from(zipBytes))
            expect(files.watched).toContain("Arrival")
            expect(files.lists).toBeDefined()
            expect(files.lists).toHaveLength(2)
            expect(files.lists![0].fileName).toBe("lists/favorites.csv")
            expect(files.lists![1].fileName).toBe("lists/top10.csv")
        })
    })

    describe("parseLetterboxdList", () => {
        it("parses the normal shape with version line", () => {
            const csv = [
                "Letterboxd list export v7",
                "Date,Name,Tags,URL,Description",
                "2024-05-01,My Top Movies,\"sci-fi, favorites\",https://boxd.it/xyz,\"A collection of my favorite sci-fi movies.\"",
                "",
                "Position,Name,Year,URL,Description",
                "1,2001: A Space Odyssey,1968,https://boxd.it/2a0i,\"Kubrick masterpiece\"",
                "2,Solaris,1972,https://boxd.it/184e,",
            ].join("\n")

            const res = parseLetterboxdList(csv, "my-top-movies.csv")
            expect(res.ok).toBe(true)
            if (!res.ok) return
            expect(res.list.name).toBe("My Top Movies")
            expect(res.list.description).toBe("A collection of my favorite sci-fi movies.")
            expect(res.list.films).toHaveLength(2)
            expect(res.list.films[0]).toEqual({
                position: 1,
                name: "2001: A Space Odyssey",
                year: 1968,
                uri: "boxd.it/2a0i",
            })
            expect(res.list.films[1]).toEqual({
                position: 2,
                name: "Solaris",
                year: 1972,
                uri: "boxd.it/184e",
            })
        })

        it("parses successfully when version line is absent", () => {
            const csv = [
                "Date,Name,Tags,URL,Description",
                "2024-05-01,No Version List,,https://boxd.it/nv,Simple description",
                "",
                "Position,Name,Year,URL",
                "1,Alien,1979,https://boxd.it/2a6q",
            ].join("\n")

            const res = parseLetterboxdList(csv, "no-version.csv")
            expect(res.ok).toBe(true)
            if (!res.ok) return
            expect(res.list.name).toBe("No Version List")
            expect(res.list.description).toBe("Simple description")
            expect(res.list.films).toHaveLength(1)
            expect(res.list.films[0].name).toBe("Alien")
            expect(res.list.films[0].year).toBe(1979)
        })

        it("ignores extra/unknown columns in both header and film rows", () => {
            const csv = [
                "ExtraCol1,Date,Name,ExtraCol2,Tags,URL,Description,ExtraCol3",
                "foo,2024-05-01,Extra Cols List,bar,,https://boxd.it/ec,Desc,baz",
                "",
                "Custom1,Position,Custom2,Name,Custom3,Year,Custom4,URL,Custom5",
                "x,1,y,Blade Runner,z,1982,w,https://boxd.it/2b04,v",
            ].join("\n")

            const res = parseLetterboxdList(csv, "extra.csv")
            expect(res.ok).toBe(true)
            if (!res.ok) return
            expect(res.list.name).toBe("Extra Cols List")
            expect(res.list.description).toBe("Desc")
            expect(res.list.films).toHaveLength(1)
            expect(res.list.films[0]).toEqual({
                position: 1,
                name: "Blade Runner",
                year: 1982,
                uri: "boxd.it/2b04",
            })
        })

        it("handles quoted commas and newlines in descriptions", () => {
            const csv = [
                "Letterboxd list export v7",
                "Date,Name,Tags,URL,Description",
                "2024-05-01,Multiline List,,https://boxd.it/ml,\"Line 1, with a comma\nLine 2, another line\nLine 3\"",
                "",
                "Position,Name,Year,URL",
                "1,Arrival,2016,https://boxd.it/bW9S",
            ].join("\n")

            const res = parseLetterboxdList(csv, "multiline.csv")
            expect(res.ok).toBe(true)
            if (!res.ok) return
            expect(res.list.name).toBe("Multiline List")
            expect(res.list.description).toBe("Line 1, with a comma\nLine 2, another line\nLine 3")
            expect(res.list.films).toHaveLength(1)
        })

        it("returns ok: false with 'no films' for an empty film section", () => {
            const csv = [
                "Letterboxd list export v7",
                "Date,Name,Tags,URL,Description",
                "2024-05-01,Empty Film Section List,,https://boxd.it/empty,No films here",
                "",
                "Position,Name,Year,URL",
            ].join("\n")

            const res = parseLetterboxdList(csv, "empty.csv")
            expect(res).toEqual({ ok: false, reason: "no films" })
        })

        it("handles BOM correctly", () => {
            const bom = "\uFEFF"
            const csv = bom + [
                "Date,Name,Tags,URL,Description",
                "2024-05-01,BOM List,,https://boxd.it/bom,BOM test",
                "",
                "Position,Name,Year,URL",
                "1,Metropolis,1927,https://boxd.it/29U0",
            ].join("\n")

            const res = parseLetterboxdList(csv, "bom.csv")
            expect(res.ok).toBe(true)
            if (!res.ok) return
            expect(res.list.name).toBe("BOM List")
            expect(res.list.films).toHaveLength(1)
            expect(res.list.films[0].name).toBe("Metropolis")
        })

        it("returns ok: false with 'no list name' if list name is missing", () => {
            const csv = [
                "Date,Name,Tags,URL,Description",
                "2024-05-01,,,https://boxd.it/empty,Description only",
                "",
                "Position,Name,Year,URL",
                "1,Metropolis,1927,https://boxd.it/29U0",
            ].join("\n")

            const res = parseLetterboxdList(csv, "noname.csv")
            expect(res).toEqual({ ok: false, reason: "no list name" })
        })

        it("returns ok: false with 'empty or unreadable file' for empty or unreadable input", () => {
            expect(parseLetterboxdList("", "empty.csv")).toEqual({
                ok: false,
                reason: "empty or unreadable file",
            })
        })

        it("returns ok: false with 'no film section' when film section is absent", () => {
            const csv = [
                "Date,Name,Tags,URL,Description",
                "2024-05-01,Only Meta List,,https://boxd.it/om,Description",
            ].join("\n")

            const res = parseLetterboxdList(csv, "no-section.csv")
            expect(res).toEqual({ ok: false, reason: "no film section" })
        })
    })
})
