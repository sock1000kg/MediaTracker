import { describe, expect, it, beforeEach } from "@jest/globals"
import request from "supertest"
import app from "@/app.js"
import { prisma } from "@/tests/jest.setup.js"
import { findUserByUsername } from "@/repositories/authRepository.js"
import { findMediaTypeForUserOrGlobal } from "@/repositories/mediaTypeRepository.js"
import { jest } from "@jest/globals"
import { getQueue, registerAllHandlers } from "@/queue/index.js"
import { MemoryQueue } from "@/queue/memoryQueue.js"
import { zipSync, strToU8 } from "fflate"
import {
    letterboxdImportService,
    LetterboxdImportService,
    type LetterboxdResolver,
    letterboxdFilmKey,
} from "@/services/imports/letterboxdImportService.js"
import { SearchResult } from "@/schemas/search/searchSchemas.js"

const API = "/imports/letterboxd"
const queue = () => getQueue() as MemoryQueue

async function registerAndLogin(username: string) {
    await request(app)
        .post("/auth/register")
        .send({ username, password: "StrongPass1!", displayName: "Tester", registerKey: process.env.REGISTER_KEY })
        .set("Content-Type", "application/json")

    const loginRes = await request(app)
        .post("/auth/login")
        .send({ username, password: "StrongPass1!" })
        .set("Content-Type", "application/json")

    return {
        token: loginRes.body.accessToken as string,
        userId: loginRes.body.user.id as number,
    }
}

async function uploadLetterboxd(token: string, content: Buffer | string, filename = "export.zip") {
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content)
    return request(app)
        .post(API)
        .set("Authorization", `Bearer ${token}`)
        .attach("file", buf, filename)
}

async function importAndWait(token: string, content: Buffer | string, filename = "export.zip") {
    const res = await uploadLetterboxd(token, content, filename)
    expect(res.statusCode).toBe(202)
    expect(typeof res.body.jobId).toBe("string")
    await queue().drain()
    const job = await request(app).get(`/jobs/${res.body.jobId}`).set("Authorization", `Bearer ${token}`)
    return { jobId: res.body.jobId as string, job: job.body, status: job.statusCode }
}

describe("Media Import Routes (Letterboxd)", () => {
    let token: string
    let userId: number
    let systemUserId: number
    let movieTypeId: number

    const mockResolver: LetterboxdResolver = async (films) => {
        const map = new Map<string, SearchResult | null>()
        for (const f of films) {
            const key = letterboxdFilmKey(f.name, f.year)
            if (f.name.toLowerCase() === "unmatched film") {
                map.set(key, null)
            } else if (f.name.toLowerCase() === "inception") {
                map.set(key, {
                    title: "Inception",
                    creator: null,
                    year: "2010",
                    description: "A thief who steals corporate secrets...",
                    source: "tmdb",
                    sourceId: "movie-27205",
                    imageUrl: "https://image.tmdb.org/t/p/w342/inception.jpg",
                    metadata: {
                        kind: "movie",
                        categories: ["Action", "Science Fiction"],
                    },
                })
            } else if (f.name.toLowerCase() === "dune: part two") {
                map.set(key, {
                    title: "Dune: Part Two",
                    creator: "Denis Villeneuve",
                    creators: [{ name: "Denis Villeneuve", role: "director" }],
                    year: "2024",
                    description: "Follow the mythic journey of Paul Atreides...",
                    source: "tmdb",
                    sourceId: "movie-693134",
                    imageUrl: "https://image.tmdb.org/t/p/w342/dune2.jpg",
                    metadata: {
                        kind: "movie",
                        categories: ["Science Fiction", "Adventure"],
                    },
                })
            } else if (f.name.toLowerCase() === "fight club") {
                map.set(key, {
                    title: "Fight Club",
                    creator: null,
                    year: "1999",
                    description: "An insomniac office worker...",
                    source: "tmdb",
                    sourceId: "movie-550",
                    imageUrl: "https://image.tmdb.org/t/p/w342/fightclub.jpg",
                    metadata: {
                        kind: "movie",
                        categories: ["Drama"],
                    },
                })
            } else if (f.name.toLowerCase() === "interstellar") {
                map.set(key, {
                    title: "Interstellar",
                    creator: null,
                    year: "2014",
                    description: "The adventures of a group of explorers...",
                    source: "tmdb",
                    sourceId: "movie-157336",
                    imageUrl: "https://image.tmdb.org/t/p/w342/interstellar.jpg",
                    metadata: {
                        kind: "movie",
                        categories: ["Adventure", "Drama", "Science Fiction"],
                    },
                })
            } else {
                map.set(key, null)
            }
        }
        return map
    }

    beforeEach(async () => {
        registerAllHandlers()
        const u = await registerAndLogin(`boxd_user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`)
        token = u.token
        userId = u.userId

        const sysUser = await findUserByUsername("system", prisma)
        systemUserId = sysUser!.id

        const mType = await findMediaTypeForUserOrGlobal("movie", userId, prisma)
        movieTypeId = mType!.id
    })

    it("imports movie logs with right status, rating and dates, counting imported/skipped/unmatched", async () => {
        const zipBytes = zipSync({
            "watched.csv": strToU8("Date,Name,Year,Letterboxd URI\n2024-01-10,Inception,2010,https://boxd.it/1sXg\n"),
            "ratings.csv": strToU8("Date,Name,Year,Letterboxd URI,Rating\n2024-01-12,Inception,2010,https://boxd.it/1sXg,4.5\n"),
            "watchlist.csv": strToU8("Date,Name,Year,Letterboxd URI\n2024-03-01,Dune: Part Two,2024,https://boxd.it/n0sC\n"),
        })

        const resolverSpy = jest.fn(mockResolver)
        jest.spyOn(letterboxdImportService, "importFromLetterboxd").mockImplementation(async (u, files, opts) => {
            return LetterboxdImportService.prototype.importFromLetterboxd.call(
                letterboxdImportService,
                u,
                files,
                { ...opts, resolver: resolverSpy }
            )
        })

        const { job, status } = await importAndWait(token, Buffer.from(zipBytes))
        expect(status).toBe(200)
        expect(job.status).toBe("completed")
        expect(job.result.imported).toBe(2)
        expect(job.result.skipped).toBe(0)
        expect(job.result.unmatched).toBe(0)

        // Verify Inception log
        const inceptionMedia = await prisma.media.findFirst({
            where: { source: "tmdb", sourceId: "movie-27205" },
        })
        expect(inceptionMedia).not.toBeNull()

        const inceptionLog = await prisma.userLogs.findUnique({
            where: { userId_mediaId: { userId, mediaId: inceptionMedia!.id } },
        })
        expect(inceptionLog).not.toBeNull()
        expect(inceptionLog!.status).toBe("completed")
        expect(inceptionLog!.rating).toBe(90) // 4.5 * 20
        expect(inceptionLog!.finished_at).toEqual(new Date(Date.UTC(2024, 0, 10, 12)))

        // Verify Dune log (watchlist-only -> wishlist, no rating, no finished_at)
        const duneMedia = await prisma.media.findFirst({
            where: { source: "tmdb", sourceId: "movie-693134" },
        })
        expect(duneMedia).not.toBeNull()

        const duneLog = await prisma.userLogs.findUnique({
            where: { userId_mediaId: { userId, mediaId: duneMedia!.id } },
        })
        expect(duneLog).not.toBeNull()
        expect(duneLog!.status).toBe("wishlist")
        expect(duneLog!.rating).toBeNull()
        expect(duneLog!.finished_at).toBeNull()

        // Verify director creator role was persisted
        const duneCreators = await prisma.mediaCreator.findMany({
            where: { mediaId: duneMedia!.id },
            include: { creator: true },
        })
        expect(duneCreators).toHaveLength(1)
        expect(duneCreators[0].role).toBe("director")
        expect(duneCreators[0].creator.name).toBe("Denis Villeneuve")
    })

    it("re-importing the same ZIP calls resolver with empty list, creates no new media or logs, and reports skipped", async () => {
        const zipBytes = zipSync({
            "watched.csv": strToU8("Date,Name,Year,Letterboxd URI\n2024-01-10,Interstellar,2014,https://boxd.it/interstellar_reimport\n"),
            "ratings.csv": strToU8("Date,Name,Year,Letterboxd URI,Rating\n2024-01-12,Interstellar,2014,https://boxd.it/interstellar_reimport,4.5\n"),
        })

        const firstResolver = jest.fn(mockResolver)
        jest.spyOn(letterboxdImportService, "importFromLetterboxd").mockImplementation(async (u, files, opts) => {
            return LetterboxdImportService.prototype.importFromLetterboxd.call(
                letterboxdImportService,
                u,
                files,
                { ...opts, resolver: firstResolver }
            )
        })

        // First import
        const first = await importAndWait(token, Buffer.from(zipBytes))
        expect(first.job.result.imported).toBe(1)
        expect(firstResolver).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ name: "Interstellar" })]),
            userId
        )

        // Second import of same ZIP
        const secondResolver = jest.fn(mockResolver)
        jest.spyOn(letterboxdImportService, "importFromLetterboxd").mockImplementation(async (u, files, opts) => {
            return LetterboxdImportService.prototype.importFromLetterboxd.call(
                letterboxdImportService,
                u,
                files,
                { ...opts, resolver: secondResolver }
            )
        })

        const second = await importAndWait(token, Buffer.from(zipBytes))
        expect(second.job.result.imported).toBe(0)
        expect(second.job.result.skipped).toBe(1)

        // Re-import called resolver with empty list because film was found in catalogue
        expect(secondResolver).toHaveBeenCalledWith([], userId)
    })

    it("reuses movie already in catalogue as source: 'tmdb' (logged from search) and attaches letterboxd external id", async () => {
        // Pre-create Fight Club as if logged from search
        const existingMovie = await prisma.media.create({
            data: {
                title: "Fight Club",
                year: 1999,
                source: "tmdb",
                sourceId: "movie-550",
                mediaTypeId: movieTypeId,
                userId: systemUserId,
            },
        })
        await prisma.mediaExternalId.create({
            data: {
                mediaId: existingMovie.id,
                provider: "tmdb",
                externalId: "movie-550",
            },
        })

        const zipBytes = zipSync({
            "watched.csv": strToU8("Date,Name,Year,Letterboxd URI\n2024-05-01,Fight Club,1999,https://boxd.it/2a1W\n"),
        })

        jest.spyOn(letterboxdImportService, "importFromLetterboxd").mockImplementation(async (u, files, opts) => {
            return LetterboxdImportService.prototype.importFromLetterboxd.call(
                letterboxdImportService,
                u,
                files,
                { ...opts, resolver: mockResolver }
            )
        })

        const { job } = await importAndWait(token, Buffer.from(zipBytes))
        expect(job.result.imported).toBe(1)

        // Check that the user log links to the existing movie
        const userLog = await prisma.userLogs.findUnique({
            where: { userId_mediaId: { userId, mediaId: existingMovie.id } },
        })
        expect(userLog).not.toBeNull()

        // Check that the existing movie now has the letterboxd external id
        const extIds = await prisma.mediaExternalId.findMany({
            where: { mediaId: existingMovie.id },
        })
        const hasLetterboxd = extIds.some(
            x => x.provider === "letterboxd" && x.externalId === "boxd.it/2a1W"
        )
        expect(hasLetterboxd).toBe(true)
    })

    it("stores a film the resolver cannot match with source: 'letterboxd' and counts as unmatched", async () => {
        const zipBytes = zipSync({
            "watched.csv": strToU8("Date,Name,Year,Letterboxd URI\n2024-02-14,Unmatched Film,2021,https://boxd.it/unm1\n"),
        })

        jest.spyOn(letterboxdImportService, "importFromLetterboxd").mockImplementation(async (u, files, opts) => {
            return LetterboxdImportService.prototype.importFromLetterboxd.call(
                letterboxdImportService,
                u,
                files,
                { ...opts, resolver: mockResolver }
            )
        })

        const { job } = await importAndWait(token, Buffer.from(zipBytes))
        expect(job.result.imported).toBe(1)
        expect(job.result.unmatched).toBe(1)
        expect(job.result.notes).toContain("1 films couldn't be matched to TMDB and were added by title.")
        expect(job.result.notes).toEqual(
            expect.arrayContaining([expect.stringContaining("Unmatched Film")])
        )

        const unmatchedMedia = await prisma.media.findFirst({
            where: { title: "Unmatched Film", source: "letterboxd" },
        })
        expect(unmatchedMedia).not.toBeNull()
        expect(unmatchedMedia!.sourceId).toBe("boxd.it/unm1")
    })

    it("calls resolver with [] when re-importing a diary-only export", async () => {
        const diaryCsv =
            "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n" +
            "2024-03-01,Diary Only Film,2023,,4.0,No,indie,2024-03-01\n"

        const zipBytes = zipSync({
            "diary.csv": strToU8(diaryCsv),
        })

        const firstResolver = jest.fn(mockResolver)
        const spy = jest.spyOn(letterboxdImportService, "importFromLetterboxd").mockImplementation(async (u, files, opts) => {
            return LetterboxdImportService.prototype.importFromLetterboxd.call(
                letterboxdImportService,
                u,
                files,
                { ...opts, resolver: firstResolver }
            )
        })

        const first = await importAndWait(token, Buffer.from(zipBytes))
        expect(first.job.result.imported).toBe(1)
        expect(firstResolver).toHaveBeenCalledWith(
            [{ name: "Diary Only Film", year: 2023 }],
            userId
        )

        // Second import of the identical diary export: should hit catalogue by title+year and make 0 resolver calls
        const secondResolver = jest.fn(mockResolver)
        spy.mockImplementation(async (u, files, opts) => {
            return LetterboxdImportService.prototype.importFromLetterboxd.call(
                letterboxdImportService,
                u,
                files,
                { ...opts, resolver: secondResolver }
            )
        })

        const second = await importAndWait(token, Buffer.from(zipBytes))
        expect(second.job.result.imported).toBe(0)
        expect(second.job.result.skipped).toBe(1)
        expect(secondResolver).toHaveBeenCalledWith([], userId)
    })

    it("returns 400 for non-ZIP or invalid upload", async () => {
        const res = await uploadLetterboxd(token, "plain text not a zip", "bad.zip")
        expect(res.statusCode).toBe(400)
        expect(res.body.message).toContain("This doesn't look like a Letterboxd export")
    })

    it("returns 400 'File is too large (max 10 MB)' for upload over 10 MB", async () => {
        // Create an oversized buffer > 10 MB
        const hugeBuf = Buffer.alloc(10 * 1024 * 1024 + 100, 0)
        const res = await uploadLetterboxd(token, hugeBuf, "huge.zip")
        expect(res.statusCode).toBe(400)
        expect(res.body.message).toBe("File is too large (max 10 MB)")
    })

    it("an import with likes creates the 'Letterboxd likes' collection with those films, and a re-import adds nothing and doesn't duplicate", async () => {
        const zipBytes = zipSync({
            "watched.csv": strToU8("Date,Name,Year,Letterboxd URI\n2025-06-27,Whiplash,2014,https://boxd.it/7bQA\n2025-08-10,Creep,2014,https://boxd.it/7l4c\n"),
            "likes/films.csv": strToU8("Date,Name,Year,Letterboxd URI\n2025-06-27,Whiplash,2014,https://boxd.it/7bQA\n2025-08-10,Creep,2014,https://boxd.it/7l4c\n"),
        })

        jest.spyOn(letterboxdImportService, "importFromLetterboxd").mockImplementation(async (u, files, opts) => {
            return LetterboxdImportService.prototype.importFromLetterboxd.call(
                letterboxdImportService,
                u,
                files,
                { ...opts, resolver: mockResolver }
            )
        })

        const first = await importAndWait(token, Buffer.from(zipBytes))
        expect(first.job.result.imported).toBe(2)
        expect(first.job.result.liked).toBe(2)
        expect(first.job.result.notes).toContain("Added 2 liked films to the Letterboxd likes collection")

        const coll = await prisma.collection.findFirst({
            where: { userId, nameKey: "letterboxd likes" },
            include: { items: { include: { log: { include: { media: true } } }, orderBy: { position: "asc" } } },
        })
        expect(coll).not.toBeNull()
        expect(coll!.items).toHaveLength(2)
        expect(coll!.items[0].log.media.title).toBe("Whiplash")
        expect(coll!.items[1].log.media.title).toBe("Creep")

        // Re-import
        const second = await importAndWait(token, Buffer.from(zipBytes))
        expect(second.job.result.imported).toBe(0)
        expect(second.job.result.liked).toBe(0)

        const collAfter = await prisma.collection.findFirst({
            where: { userId, nameKey: "letterboxd likes" },
            include: { items: { include: { log: { include: { media: true } } }, orderBy: { position: "asc" } } },
        })
        expect(collAfter!.items).toHaveLength(2)
        expect(collAfter!.items[0].log.media.title).toBe("Whiplash")
        expect(collAfter!.items[1].log.media.title).toBe("Creep")
    })

    it("appends new liked films to an existing 'Letterboxd likes' collection without duplicating", async () => {
        const coll = await prisma.collection.create({
            data: {
                userId,
                name: "Letterboxd likes",
                nameKey: "letterboxd likes",
                ranked: false,
            },
        })

        const existingMedia = await prisma.media.create({
            data: {
                title: "Existing Film",
                mediaTypeId: movieTypeId,
                source: "custom",
                sourceId: "custom-1",
            },
        })
        const existingLog = await prisma.userLogs.create({
            data: {
                userId,
                mediaId: existingMedia.id,
                status: "completed",
            },
        })
        await prisma.collectionItem.create({
            data: {
                collectionId: coll.id,
                logId: existingLog.id,
                position: 0,
            },
        })

        const zipBytes = zipSync({
            "likes/films.csv": strToU8("Date,Name,Year,Letterboxd URI\n2025-06-27,Whiplash,2014,https://boxd.it/7bQA\n"),
        })

        jest.spyOn(letterboxdImportService, "importFromLetterboxd").mockImplementation(async (u, files, opts) => {
            return LetterboxdImportService.prototype.importFromLetterboxd.call(
                letterboxdImportService,
                u,
                files,
                { ...opts, resolver: mockResolver }
            )
        })

        const res = await importAndWait(token, Buffer.from(zipBytes))
        expect(res.job.result.liked).toBe(1)
        expect(res.job.result.notes).toContain("Added 1 liked films to the Letterboxd likes collection")

        const collAfter = await prisma.collection.findFirst({
            where: { userId, id: coll.id },
            include: { items: { include: { log: { include: { media: true } } }, orderBy: { position: "asc" } } },
        })
        expect(collAfter!.items).toHaveLength(2)
        expect(collAfter!.items[0].log.media.title).toBe("Existing Film")
        expect(collAfter!.items[1].log.media.title).toBe("Whiplash")
    })
})
