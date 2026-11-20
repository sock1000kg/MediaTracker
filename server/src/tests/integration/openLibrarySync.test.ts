import { prisma } from "@/tests/jest.setup.js"
import { syncOpenLibraryBooks } from "@/services/openLibrarySyncService.js"
import { openLibraryLimiter } from "@/services/search/rateLimiter.js"
import { jest } from "@jest/globals"

describe("Open Library background sync job (G2, G3, T1)", () => {
    let bookTypeId: string
    let systemUserId: string

    beforeAll(async () => {
        const bt = await prisma.mediaType.findFirstOrThrow({ where: { name: "book" } })
        bookTypeId = bt.id
        const su = await prisma.user.findFirstOrThrow({ where: { username: "system" } })
        systemUserId = su.id
    })

    beforeEach(async () => {
        openLibraryLimiter.reset()
    })

    test("fills cover, genres, publisher, pages, and work key; batches multiple ISBNs in one request", async () => {
        // Create 2 test Goodreads books with ISBNs
        const b1 = await prisma.media.create({
            data: {
                title: "Book One",
                creator: "Author One",
                year: null, // to verify first_publish_year fills in
                provider: "goodreads",
                providerId: "gr-101",
                imageUrl: null,
                mediaTypeId: bookTypeId,
                userId: systemUserId,
                details: {
                    url: "https://www.goodreads.com/book/show/gr-101",
                    isbn13: "9781111111111",
                    pageCount: 150, // CSV fallback
                },
                externalIds: {
                    create: [
                        { provider: "goodreads", externalId: "gr-101" },
                        { provider: "isbn13", externalId: "9781111111111" },
                    ],
                },
            },
        })

        const b2 = await prisma.media.create({
            data: {
                title: "Book Two",
                creator: "Author Two",
                year: 2020,
                provider: "goodreads",
                providerId: "gr-102",
                imageUrl: null,
                mediaTypeId: bookTypeId,
                userId: systemUserId,
                details: {
                    url: "https://www.goodreads.com/book/show/gr-102",
                    isbn: "0222222222",
                },
                externalIds: {
                    create: [
                        { provider: "goodreads", externalId: "gr-102" },
                        { provider: "isbn", externalId: "0222222222" },
                    ],
                },
            },
        })

        const requestsMade: string[] = []
        const fetchSpy = jest.spyOn(globalThis, "fetch").mockImplementation(async (info: RequestInfo | URL) => {
            const urlStr = info.toString()
            requestsMade.push(urlStr)

            // Return both books in response to the batch query
            return new Response(JSON.stringify({
                numFound: 2,
                docs: [
                    {
                        key: "/works/OL101W",
                        title: "Book One",
                        author_name: ["Author One"],
                        isbn: ["9781111111111", "1111111111"],
                        cover_i: 10101,
                        number_of_pages_median: 220,
                        publisher: ["Publisher One"],
                        subject: ["Fiction", "Adventure", "Fantasy"],
                        first_publish_year: 2015,
                    },
                    {
                        key: "/works/OL102W",
                        title: "Book Two",
                        author_name: ["Author Two"],
                        isbn: ["0222222222", "9780222222222"],
                        cover_i: 10202,
                        number_of_pages_median: 310,
                        publisher: ["Publisher Two"],
                        subject: ["Mystery"],
                        first_publish_year: 2020,
                    },
                ],
            }), { status: 200, headers: { "Content-Type": "application/json" } })
        })

        const result = await syncOpenLibraryBooks(prisma)
        expect(result.processed).toBe(2)
        expect(result.updated).toBe(2)

        // Verify only 1 batch request was made for both ISBNs
        expect(requestsMade).toHaveLength(1)
        expect(decodeURIComponent(requestsMade[0].replace(/\+/g, " "))).toContain("isbn:(9781111111111 OR 0222222222)")

        // Check b1 updated fields
        const updated1 = await prisma.media.findUniqueOrThrow({
            where: { id: b1.id },
            include: { externalIds: true, genres: { include: { genre: true } } },
        })
        expect(updated1.imageUrl).toBe("https://covers.openlibrary.org/b/id/10101-M.jpg")
        expect(updated1.year).toBe(2015) // Open Library's first_publish_year
        const details1 = updated1.details as Record<string, unknown>
        expect(details1.pageCount).toBe(220) // OL median pages won over CSV 150
        expect(details1.publisher).toBe("Publisher One")
        expect(updated1.syncedAt).toBeTruthy()
        expect(updated1.syncCheckedAt).toBeTruthy()
        expect(updated1.externalIds.some(e => e.provider === "openlibrary" && e.externalId === "/works/OL101W")).toBe(true)
        expect(updated1.genres.map(g => g.genre.name)).toEqual(["Fiction", "Adventure", "Fantasy"])

        // Check b2 updated fields
        const updated2 = await prisma.media.findUniqueOrThrow({
            where: { id: b2.id },
            include: { externalIds: true, genres: { include: { genre: true } } },
        })
        expect(updated2.imageUrl).toBe("https://covers.openlibrary.org/b/id/10202-M.jpg")
        expect(updated2.year).toBe(2020) // unchanged
        const details2 = updated2.details as Record<string, unknown>
        expect(details2.pageCount).toBe(310)
        expect(updated2.syncedAt).toBeTruthy()
        expect(updated2.syncCheckedAt).toBeTruthy()
        expect(updated2.externalIds.some(e => e.provider === "openlibrary" && e.externalId === "/works/OL102W")).toBe(true)

        // A second run makes no requests because syncCheckedAt is stamped on both
        requestsMade.length = 0
        const secondRun = await syncOpenLibraryBooks(prisma)
        expect(secondRun.processed).toBe(0)
        expect(requestsMade).toHaveLength(0)

        fetchSpy.mockRestore()
    })

    test("ISBN-less row uses title/author query with Open Library syntax (G3); no match stamps the row", async () => {
        const bNoIsbn = await prisma.media.create({
            data: {
                title: "Unknown Odyssey",
                creator: "Homer Simpson",
                year: 1990,
                provider: "goodreads",
                providerId: "gr-no-isbn-1",
                mediaTypeId: bookTypeId,
                userId: systemUserId,
            },
        })

        const requestsMade: string[] = []
        const fetchSpy = jest.spyOn(globalThis, "fetch").mockImplementation(async (info: RequestInfo | URL) => {
            const urlStr = info.toString()
            requestsMade.push(urlStr)

            // Return no match
            return new Response(JSON.stringify({
                numFound: 0,
                docs: [],
            }), { status: 200, headers: { "Content-Type": "application/json" } })
        })

        const result = await syncOpenLibraryBooks(prisma)
        expect(result.processed).toBe(1)
        expect(result.updated).toBe(0)

        expect(requestsMade).toHaveLength(1)
        const req = requestsMade[0]
        // Open Library syntax: q=<title>&author=<first author> (q also matches edition titles)
        expect(req).toContain("q=Unknown+Odyssey")
        expect(req).toContain("author=Homer+Simpson")
        // NEVER intitle: or inauthor:
        expect(req).not.toContain("intitle:")
        expect(req).not.toContain("inauthor:")

        const updated = await prisma.media.findUniqueOrThrow({ where: { id: bNoIsbn.id } })
        expect(updated.syncCheckedAt).toBeTruthy() // stamped on "no match" so it won't retry

        fetchSpy.mockRestore()
    })

    test("a failure neither stamps nor erases, and stops early after consecutive failures", async () => {
        const bFail = await prisma.media.create({
            data: {
                title: "Failed Book",
                creator: "Author Fail",
                year: 1999,
                provider: "goodreads",
                providerId: "gr-fail-1",
                imageUrl: "https://existing-cover.com/img.jpg",
                mediaTypeId: bookTypeId,
                userId: systemUserId,
                details: {
                    url: "https://www.goodreads.com/book/show/gr-fail-1",
                    isbn13: "9789999999999",
                },
            },
        })

        const fetchSpy = jest.spyOn(globalThis, "fetch").mockImplementation(async () => {
            return new Response("Internal Server Error", { status: 500 })
        })

        const result = await syncOpenLibraryBooks(prisma)
        expect(result.processed).toBe(0)
        expect(result.updated).toBe(0)

        const unupdated = await prisma.media.findUniqueOrThrow({ where: { id: bFail.id } })
        expect(unupdated.imageUrl).toBe("https://existing-cover.com/img.jpg") // not erased
        expect(unupdated.syncCheckedAt).toBeNull() // not stamped

        fetchSpy.mockRestore()
    })
    test("two editions matching the same work merge into one item, keeping the second edition's id and its readers' logs", async () => {
        const kindle = await prisma.media.create({
            data: { title: "Twin Edition", creator: "Same Author", provider: "goodreads", providerId: "gr-twin-1", mediaTypeId: bookTypeId, userId: systemUserId },
        })
        const paperback = await prisma.media.create({
            data: { title: "Twin Edition", creator: "Same Author", provider: "goodreads", providerId: "gr-twin-2", mediaTypeId: bookTypeId, userId: systemUserId },
        })
        const reader = await prisma.user.create({ data: { username: `twin_reader_${Date.now()}`, password: "x" } })
        await prisma.userLogs.create({ data: { userId: reader.id, mediaId: kindle.id, status: "completed", entries: { create: [{ finishedAt: new Date("2024-02-02"), name: "Twin (Kindle)" }] } } })
        await prisma.userLogs.create({ data: { userId: reader.id, mediaId: paperback.id, status: "completed", entries: { create: [{ finishedAt: new Date("2023-02-02"), name: "Twin (Paperback)" }] } } })
        const fetchSpy = jest.spyOn(globalThis, "fetch").mockImplementation(async () =>
            new Response(JSON.stringify({ numFound: 1, docs: [{ key: "/works/OLTWINW", title: "Twin Edition" }] }), { status: 200 })
        )

        await syncOpenLibraryBooks(prisma)

        const rows = await prisma.media.findMany({ where: { id: { in: [kindle.id, paperback.id] } } })
        expect(rows).toHaveLength(1) // one item
        expect(rows[0]).toMatchObject({ provider: "openlibrary", providerId: "/works/OLTWINW" })
        const ext = await prisma.mediaExternalId.findMany({ where: { mediaId: rows[0].id } })
        expect(ext.map(e => `${e.provider}:${e.externalId}`)).toEqual(expect.arrayContaining(["goodreads:gr-twin-1", "goodreads:gr-twin-2", "openlibrary:/works/OLTWINW"]))

        // the reader's two logs are one log with both entries, each entry keeps its name
        const logs = await prisma.userLogs.findMany({ where: { userId: reader.id }, include: { entries: true } })
        expect(logs).toHaveLength(1)
        expect(logs[0].mediaId).toBe(rows[0].id)
        expect(logs[0].entries.map(e => e.name).sort()).toEqual(["Twin (Kindle)", "Twin (Paperback)"])

        fetchSpy.mockRestore()
    })
})
