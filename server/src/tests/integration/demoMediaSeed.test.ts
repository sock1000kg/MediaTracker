import { prisma } from "@/tests/jest.setup.js"
import { seedDemoMedia, loadDemoFixture } from "@/tests/fixtures/demo/seedDemoMedia.js"
import { findUserByUsername } from "@/repositories/authRepository.js"
import { demoService } from "@/services/demoService.js"
import fs from "fs"
import path from "path"
import { parse } from "csv-parse/sync"
import { parseMalExport } from "@/services/imports/malImportService.js"
import { unzipLetterboxdExport, mergeLetterboxdFiles } from "@/services/imports/letterboxdImportService.js"

describe("Demo Media Seeding (Integration)", () => {
    let demoUserId: string

    beforeAll(async () => {
        const demoUser = await findUserByUsername("demo", prisma)
        if (!demoUser) throw new Error("Demo user not found")
        demoUserId = demoUser.id

        // Ensure clean slate with only the default seed log for demo user
        await prisma.collectionItem.deleteMany({ where: { collection: { userId: demoUserId } } })
        await prisma.collection.deleteMany({ where: { userId: demoUserId } })
        await prisma.logTag.deleteMany({ where: { log: { userId: demoUserId } } })
        await prisma.userLogs.deleteMany({ where: { userId: demoUserId } })
        await prisma.tag.deleteMany({ where: { userId: demoUserId } })

        const defaultMedia = await prisma.media.findFirst({ where: { title: "Default Media" } })
        if (defaultMedia) {
            await prisma.userLogs.create({
                data: {
                    userId: demoUserId,
                    mediaId: defaultMedia.id,
                    status: "completed",
                    rating: 100,
                    notes: "Welcome! This is your default log! Search up or create a custom media to log it!",
                },
            })
        }
    })

    it("seeds all fixture demo media, logs, tags, and collections", async () => {
        await seedDemoMedia(demoUserId)

        // Verify logs count and type distribution
        const logs = await prisma.userLogs.findMany({
            where: { userId: demoUserId },
            include: {
                media: {
                    include: { mediaType: true },
                },
                tags: {
                    include: { tag: true },
                },
            },
        })

        const fixture = loadDemoFixture()

        // fixture logs + 1 default seed log
        expect(logs.length).toBe(fixture.items.length + 1)

        const byType = logs.reduce<Record<string, number>>((acc, l) => {
            const type = l.media.mediaType?.name || "unknown"
            acc[type] = (acc[type] || 0) + 1
            return acc
        }, {})

        const expectedByType = fixture.items.reduce<Record<string, number>>((acc, it) => {
            acc[it.mediaTypeName] = (acc[it.mediaTypeName] || 0) + 1
            return acc
        }, {})

        for (const [type, count] of Object.entries(expectedByType)) {
            expect(byType[type]).toBe(count)
        }

        // Verify status distribution for the fixture logs
        const fixtureLogs = logs.filter(l => l.media.mediaType?.name !== "book")
        expect(fixtureLogs.length).toBe(fixture.items.length)

        const byStatus = fixtureLogs.reduce<Record<string, number>>((acc, l) => {
            acc[l.status || ""] = (acc[l.status || ""] || 0) + 1
            return acc
        }, {})

        const normalizeStatus = (s: string) => s === "in progress" ? "in_progress" : s
        const expectedByStatus = fixture.items.reduce<Record<string, number>>((acc, it) => {
            const st = normalizeStatus(it.log.status)
            acc[st] = (acc[st] || 0) + 1
            return acc
        }, {})

        for (const [st, count] of Object.entries(expectedByStatus)) {
            expect(byStatus[st]).toBe(count)
        }

        // Verify dates (finished >= started)
        for (const l of fixtureLogs) {
            if (l.started_at && l.finished_at) {
                expect(l.finished_at.getTime()).toBeGreaterThanOrEqual(l.started_at.getTime())
            }
        }

        // Verify collections and dense ordering
        const collections = await prisma.collection.findMany({
            where: { userId: demoUserId },
            include: {
                items: {
                    orderBy: { position: "asc" },
                },
            },
        })

        expect(collections.length).toBe(fixture.collections.length)

        const collMap = new Map(collections.map(c => [c.name, c]))
        const favs = collMap.get("All-time favourites")!
        expect(favs).toBeDefined()
        expect(favs.ranked).toBe(true)
        const expectedFavsCount = fixture.items.filter(i => i.collections.includes("All-time favourites")).length
        expect(favs.items.length).toBe(expectedFavsCount)
        for (let i = 0; i < favs.items.length; i++) {
            expect(favs.items[i].position).toBe(i)
        }

        const shoegaze = collMap.get("Shoegaze & dream pop")!
        expect(shoegaze).toBeDefined()
        expect(shoegaze.ranked).toBe(true)
        const expectedShoegazeCount = fixture.items.filter(i => i.collections.includes("Shoegaze & dream pop")).length
        expect(shoegaze.items.length).toBe(expectedShoegazeCount)
        for (let i = 0; i < shoegaze.items.length; i++) {
            expect(shoegaze.items[i].position).toBe(i)
        }

        const comfort = collMap.get("Comfort shelf")!
        expect(comfort).toBeDefined()
        expect(comfort.ranked).toBe(false)
        const expectedComfortCount = fixture.items.filter(i => i.collections.includes("Comfort shelf")).length
        expect(comfort.items.length).toBe(expectedComfortCount)
        for (let i = 0; i < comfort.items.length; i++) {
            expect(comfort.items[i].position).toBe(i)
        }

        const rainy = collMap.get("Rainy day")!
        expect(rainy).toBeDefined()
        expect(rainy.ranked).toBe(false)
        const expectedRainyCount = fixture.items.filter(i => i.collections.includes("Rainy day")).length
        expect(rainy.items.length).toBe(expectedRainyCount)
        for (let i = 0; i < rainy.items.length; i++) {
            expect(rainy.items[i].position).toBe(i)
        }

        const upNext = collMap.get("Up next")!
        expect(upNext).toBeDefined()
        expect(upNext.ranked).toBe(false)
        const expectedUpNextCount = fixture.items.filter(i => i.collections.includes("Up next")).length
        expect(upNext.items.length).toBe(expectedUpNextCount)
        for (let i = 0; i < upNext.items.length; i++) {
            expect(upNext.items[i].position).toBe(i)
        }

        // Verify tags
        const tags = await prisma.tag.findMany({
            where: { userId: demoUserId },
        })
        expect(tags.length).toBeGreaterThanOrEqual(9)
        const tagNames = new Set(tags.map(t => t.name))
        expect(tagNames.has("comfort")).toBe(true)
        expect(tagNames.has("masterpiece")).toBe(true)
        expect(tagNames.has("shoegaze")).toBe(true)
    })

    it("is idempotent: re-seeding produces no duplicate media or logs", async () => {
        const mediaCountBefore = await prisma.media.count()
        const logCountBefore = await prisma.userLogs.count({ where: { userId: demoUserId } })
        const collCountBefore = await prisma.collection.count({ where: { userId: demoUserId } })
        const collItemCountBefore = await prisma.collectionItem.count({
            where: { collection: { userId: demoUserId } },
        })

        // Re-run seedDemoMedia
        await seedDemoMedia(demoUserId)

        const mediaCountAfter = await prisma.media.count()
        const logCountAfter = await prisma.userLogs.count({ where: { userId: demoUserId } })
        const collCountAfter = await prisma.collection.count({ where: { userId: demoUserId } })
        const collItemCountAfter = await prisma.collectionItem.count({
            where: { collection: { userId: demoUserId } },
        })

        expect(mediaCountAfter).toBe(mediaCountBefore)
        expect(logCountAfter).toBe(logCountBefore)
        expect(collCountAfter).toBe(collCountBefore)
        expect(collItemCountAfter).toBe(collItemCountBefore)
    })

    it("resetDemoUser restores exactly the same state", async () => {
        // Run resetDemoUser (which wipes demo user and re-seeds)
        await demoService.resetDemoUser()

        const logs = await prisma.userLogs.findMany({
            where: { userId: demoUserId },
            include: {
                media: {
                    include: { mediaType: true },
                },
            },
        })

        const fixture = loadDemoFixture()
        const goodreadsPath = path.resolve(process.cwd(), "src/tests/fixtures/demo/exports/goodreads.csv")
        const animePath = path.resolve(process.cwd(), "src/tests/fixtures/demo/exports/mal-anime.xml")
        const mangaPath = path.resolve(process.cwd(), "src/tests/fixtures/demo/exports/mal-manga.xml")
        const letterboxdPath = path.resolve(process.cwd(), "src/tests/fixtures/demo/exports/letterboxd.zip")

        const goodreadsRows = parse(fs.readFileSync(goodreadsPath), { columns: true, skip_empty_lines: true, trim: true, cast: true, bom: true })
        const { entries: animeEntries } = parseMalExport(fs.readFileSync(animePath))
        const { entries: mangaEntries } = parseMalExport(fs.readFileSync(mangaPath))
        const letterboxdFilms = mergeLetterboxdFiles(unzipLetterboxdExport(fs.readFileSync(letterboxdPath)))

        // 1 default log + goodreads rows + anime entries + manga entries + letterboxd films + fixture items
        const expectedTotal = 1 + goodreadsRows.length + animeEntries.length + mangaEntries.length + letterboxdFilms.length + fixture.items.length
        expect(logs.length).toBe(expectedTotal)

        const collections = await prisma.collection.findMany({
            where: { userId: demoUserId },
            include: {
                items: {
                    orderBy: { position: "asc" },
                },
            },
        })

        // fixture collections + "Letterboxd likes" created by Letterboxd export
        expect(collections.length).toBe(fixture.collections.length + 1)

        for (const coll of collections) {
            for (let i = 0; i < coll.items.length; i++) {
                expect(coll.items[i].position).toBe(i)
            }
        }
    })

    it("confirms the demo seed makes no network calls", async () => {
        const originalFetch = global.fetch
        try {
            global.fetch = () => {
                throw new Error("Network calls forbidden during demo seed")
            }
            await expect(demoService.resetDemoUser()).resolves.not.toThrow()
        } finally {
            global.fetch = originalFetch
        }
    })
})
