import request from "supertest"
import app from "@/app.js"
import { prisma } from "@/tests/jest.setup.js"
import { findUserByUsername } from "@/repositories/authRepository.js"
import { AppError } from "@/api/domain/error.js"
import { jest } from "@jest/globals"
import { getQueue, registerAllHandlers } from "@/queue/index.js"
import { MemoryQueue } from "@/queue/memoryQueue.js"
import zlib from "node:zlib"
import { malImportService, MalImportService, type MalResolver } from "@/services/imports/malImportService.js"
import { SearchResult } from "@/schemas/search/searchSchemas.js"

const API = "/imports/mal"
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
        token: loginRes.body.accessToken,
        userId: loginRes.body.user.id,
    }
}

async function uploadMal(token: string, content: Buffer | string, filename = "animelist.xml") {
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content)
    return request(app)
        .post(API)
        .set("Authorization", `Bearer ${token}`)
        .attach("file", buf, filename)
}

async function importAndWait(token: string, content: Buffer | string, filename = "animelist.xml") {
    const res = await uploadMal(token, content, filename)
    expect(res.statusCode).toBe(202)
    expect(typeof res.body.jobId).toBe("string")
    await queue().drain()
    const job = await request(app).get(`/jobs/${res.body.jobId}`).set("Authorization", `Bearer ${token}`)
    return { jobId: res.body.jobId as string, job: job.body, status: job.statusCode }
}

describe("Media Import Routes (MyAnimeList)", () => {
    let token: string
    let userId: number
    let systemUserId: number

    const mockResolver: MalResolver = async (ids: number[], kind) => {
        const map = new Map<number, SearchResult>()
        for (const id of ids) {
            if (id === 99999) continue // deliberate miss for testing unresolved
            map.set(id, {
                mediaType: kind,
                title: `Resolved Title ${id}`,
                creator: "Studio Trigger",
                year: "2024",
                source: "anilist",
                sourceId: `${kind}-${id * 10}`,
                imageUrl: "https://example.com/cover.jpg",
                description: "Resolved description",
                metadata: {
                    kind,
                    idMal: id,
                    episodes: 24,
                    format: "TV",
                },
            })
        }
        return map
    }

    beforeAll(async () => {
        registerAllHandlers()
        const sysUser = await findUserByUsername("system", prisma)
        if (!sysUser) throw new AppError("System user missing", 500)
        systemUserId = sysUser.id

        const user = await registerAndLogin("MalImportTester")
        token = user.token
        userId = user.userId
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    afterAll(async () => {
        await prisma.userLogs.deleteMany({ where: { userId } })
        await prisma.media.deleteMany({ where: { userId: systemUserId } })
    })

    test("POST /imports/mal imports valid XML and creates media, logs, and tags", async () => {
        const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<myanimelist>
    <myinfo>
        <user_export_type>1</user_export_type>
    </myinfo>
    <anime>
        <series_animedb_id>501</series_animedb_id>
        <series_title><![CDATA[Frieren Beyond Journey]]></series_title>
        <series_type>TV</series_type>
        <series_episodes>28</series_episodes>
        <my_watched_episodes>28</my_watched_episodes>
        <my_start_date>2024-01-10</my_start_date>
        <my_finish_date>2024-03-23</my_finish_date>
        <my_score>9</my_score>
        <my_status>Completed</my_status>
        <my_comments><![CDATA[Incredible journey]]></my_comments>
        <my_tags><![CDATA[fantasy, masterpiece]]></my_tags>
    </anime>
</myanimelist>`

        jest.spyOn(malImportService, "importFromMal").mockImplementation(async (u, buf, opts) => {
            return MalImportService.prototype.importFromMal.call(
                malImportService,
                u,
                buf,
                { ...opts, resolver: mockResolver }
            )
        })

        const { job, status } = await importAndWait(token, xml, "animelist.xml")
        expect(status).toBe(200)
        expect(job.status).toBe("completed")
        expect(job.result).toEqual(expect.objectContaining({
            imported: 1,
            updated: 0,
            skipped: 0,
            failures: [],
        }))

        // Verify media in DB
        const media = await prisma.media.findFirst({
            where: { source: "anilist", sourceId: "anime-5010" },
        })
        expect(media).not.toBeNull()
        expect(media!.imageUrl).toBe("https://example.com/cover.jpg")

        // Verify log in DB
        const log = await prisma.userLogs.findFirst({
            where: { userId, mediaId: media!.id },
            include: { tags: { include: { tag: true } } },
        })
        expect(log).not.toBeNull()
        expect(log!.status).toBe("Completed")
        expect(log!.rating).toBe(90) // 9 * 10
        expect(log!.notes).toBe("Incredible journey")
        expect(log!.finished_at).not.toBeNull()
        expect(log!.tags.map(t => t.tag.name).sort()).toEqual(["fantasy", "masterpiece"].sort())
    })

    test("Second run of the same file yields 0 imported, 1 skipped", async () => {
        const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<myanimelist>
    <myinfo><user_export_type>1</user_export_type></myinfo>
    <anime>
        <series_animedb_id>501</series_animedb_id>
        <series_title><![CDATA[Frieren Beyond Journey]]></series_title>
        <my_score>9</my_score>
        <my_status>Completed</my_status>
        <my_tags><![CDATA[fantasy, masterpiece]]></my_tags>
    </anime>
</myanimelist>`

        const resolver = jest.fn(mockResolver)
        jest.spyOn(malImportService, "importFromMal").mockImplementation(async (u, buf, opts) => {
            return MalImportService.prototype.importFromMal.call(
                malImportService,
                u,
                buf,
                { ...opts, resolver }
            )
        })

        const { job } = await importAndWait(token, xml)
        expect(job.result.imported).toBe(0)
        expect(job.result.updated).toBe(0)
        expect(job.result.skipped).toBe(1)
        // The title is already in the catalogue, so nothing is looked up again
        expect(resolver).toHaveBeenCalledWith([], "anime")
    })

    test("An app-set rating is not overwritten on re-import", async () => {
        const media = await prisma.media.findFirst({
            where: { source: "anilist", sourceId: "anime-5010" },
        })
        expect(media).not.toBeNull()

        // User updates rating to 95 in the app
        await prisma.userLogs.updateMany({
            where: { userId, mediaId: media!.id },
            data: { rating: 95 },
        })

        const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<myanimelist>
    <myinfo><user_export_type>1</user_export_type></myinfo>
    <anime>
        <series_animedb_id>501</series_animedb_id>
        <series_title><![CDATA[Frieren Beyond Journey]]></series_title>
        <my_score>7</my_score>
        <my_status>Completed</my_status>
    </anime>
</myanimelist>`

        jest.spyOn(malImportService, "importFromMal").mockImplementation(async (u, buf, opts) => {
            return MalImportService.prototype.importFromMal.call(
                malImportService,
                u,
                buf,
                { ...opts, resolver: mockResolver }
            )
        })

        const { job } = await importAndWait(token, xml)
        expect(job.result.skipped).toBe(1)
        expect(job.result.updated).toBe(0)

        const log = await prisma.userLogs.findFirst({
            where: { userId, mediaId: media!.id },
        })
        expect(log!.rating).toBe(95) // Preserved user's rating
    })

    test("Gap-filling updates null fields and unions tags", async () => {
        // Clear finished_at and notes on log
        const media = await prisma.media.findFirst({
            where: { source: "anilist", sourceId: "anime-5010" },
        })
        await prisma.userLogs.updateMany({
            where: { userId, mediaId: media!.id },
            data: { finished_at: null, notes: null },
        })

        const xmlWithGaps = `<?xml version="1.0" encoding="UTF-8" ?>
<myanimelist>
    <myinfo><user_export_type>1</user_export_type></myinfo>
    <anime>
        <series_animedb_id>501</series_animedb_id>
        <series_title><![CDATA[Frieren Beyond Journey]]></series_title>
        <my_start_date>2024-01-10</my_start_date>
        <my_finish_date>2024-03-25</my_finish_date>
        <my_score>9</my_score>
        <my_status>Completed</my_status>
        <my_comments><![CDATA[Filled note]]></my_comments>
        <my_tags><![CDATA[fantasy, adventure]]></my_tags>
    </anime>
</myanimelist>`

        jest.spyOn(malImportService, "importFromMal").mockImplementation(async (u, buf, opts) => {
            return MalImportService.prototype.importFromMal.call(
                malImportService,
                u,
                buf,
                { ...opts, resolver: mockResolver }
            )
        })

        const { job } = await importAndWait(token, xmlWithGaps)
        expect(job.result.updated).toBe(1)
        expect(job.result.imported).toBe(0)

        const log = await prisma.userLogs.findFirst({
            where: { userId, mediaId: media!.id },
            include: { tags: { include: { tag: true } } },
        })
        expect(log!.notes).toBe("Filled note")
        expect(log!.finished_at).not.toBeNull()
        // Union of ["fantasy", "masterpiece"] and ["fantasy", "adventure"]
        const tagNames = log!.tags.map(t => t.tag.name)
        expect(tagNames).toContain("masterpiece")
        expect(tagNames).toContain("adventure")
        expect(tagNames).toContain("fantasy")
    })

    test("Unresolved id imports with bare Media source: mal, no cover, plus note", async () => {
        const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<myanimelist>
    <myinfo><user_export_type>1</user_export_type></myinfo>
    <anime>
        <series_animedb_id>99999</series_animedb_id>
        <series_title><![CDATA[Obscure Unresolved Anime]]></series_title>
        <series_episodes>12</series_episodes>
        <my_score>8</my_score>
        <my_status>Completed</my_status>
    </anime>
</myanimelist>`

        jest.spyOn(malImportService, "importFromMal").mockImplementation(async (u, buf, opts) => {
            return MalImportService.prototype.importFromMal.call(
                malImportService,
                u,
                buf,
                { ...opts, resolver: mockResolver }
            )
        })

        const { job } = await importAndWait(token, xml)
        expect(job.result.imported).toBe(1)
        expect(job.result.notes).toContain("1 entries had no AniList match and were imported without covers.")

        const bare = await prisma.media.findFirst({
            where: { source: "mal", sourceId: "99999" },
        })
        expect(bare).not.toBeNull()
        expect(bare!.title).toBe("Obscure Unresolved Anime")
        expect(bare!.imageUrl).toBeNull()
        expect(bare!.creator).toBeNull()
        expect(bare!.kind).toBe("anime")
        expect((bare!.metadata as Record<string, unknown>)?.kind).toBeUndefined()
    })

    test("An anime already added from search with matching idMal is not duplicated", async () => {
        // Pre-create media with source anilist, sourceId anime-8888, idMal 888
        const animeType = await prisma.mediaType.findFirst({ where: { name: "anime" } })
        const existingMedia = await prisma.media.create({
            data: {
                title: "Existing Search Anime",
                mediaTypeId: animeType!.id,
                source: "anilist",
                sourceId: "anime-8888",
                userId: systemUserId,
                metadata: { kind: "anime", idMal: 888 },
            },
        })

        const mediaCountBefore = await prisma.media.count({ where: { source: "anilist" } })

        const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<myanimelist>
    <myinfo><user_export_type>1</user_export_type></myinfo>
    <anime>
        <series_animedb_id>888</series_animedb_id>
        <series_title><![CDATA[Existing Search Anime]]></series_title>
        <my_score>8</my_score>
        <my_status>Completed</my_status>
    </anime>
</myanimelist>`

        jest.spyOn(malImportService, "importFromMal").mockImplementation(async (u, buf, opts) => {
            return MalImportService.prototype.importFromMal.call(
                malImportService,
                u,
                buf,
                { ...opts, resolver: mockResolver }
            )
        })

        const { job } = await importAndWait(token, xml)
        expect(job.result.imported).toBe(1)

        const mediaCountAfter = await prisma.media.count({ where: { source: "anilist" } })
        expect(mediaCountAfter).toBe(mediaCountBefore) // No duplicate media created

        const log = await prisma.userLogs.findFirst({
            where: { userId, mediaId: existingMedia.id },
        })
        expect(log).not.toBeNull()
        expect(log!.rating).toBe(80)
    })

    test("A second upload while one is queued/active gets 409 with that jobId", async () => {
        let release!: () => void
        const gateP = new Promise<void>((r) => { release = r })
        queue().registerHandler("import.mal", async () => {
            await gateP
            return { imported: 0, skipped: 0, failures: [] }
        })

        try {
            const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<myanimelist>
    <myinfo><user_export_type>1</user_export_type></myinfo>
    <anime>
        <series_animedb_id>12345</series_animedb_id>
        <series_title><![CDATA[Parallel Anime]]></series_title>
        <my_status>Completed</my_status>
    </anime>
</myanimelist>`

            const first = await uploadMal(token, xml)
            expect(first.statusCode).toBe(202)

            const second = await uploadMal(token, xml)
            expect(second.statusCode).toBe(409)
            expect(second.body.jobId).toBe(first.body.jobId)
            expect(second.body.message).toMatch(/already running/i)
        } finally {
            release()
            await queue().drain()
            registerAllHandlers()
        }
    })

    test("Supports gzipped .xml.gz file upload", async () => {
        const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<myanimelist>
    <myinfo><user_export_type>2</user_export_type></myinfo>
    <manga>
        <manga_mangadb_id>777</manga_mangadb_id>
        <manga_title><![CDATA[Gzipped Manga]]></manga_title>
        <manga_chapters>10</manga_chapters>
        <my_status>Completed</my_status>
    </manga>
</myanimelist>`

        const gzBuffer = zlib.gzipSync(Buffer.from(xml))

        jest.spyOn(malImportService, "importFromMal").mockImplementation(async (u, buf, opts) => {
            return MalImportService.prototype.importFromMal.call(
                malImportService,
                u,
                buf,
                { ...opts, resolver: mockResolver }
            )
        })

        const { job, status } = await importAndWait(token, gzBuffer, "mangalist.xml.gz")
        expect(status).toBe(200)
        expect(job.result.imported).toBe(1)
    })

    test("Rejects upload exceeding 10 MB limit with a 400 error", async () => {
        const oversized = Buffer.alloc(10 * 1024 * 1024 + 1024, "a")
        const res = await uploadMal(token, oversized)
        expect(res.statusCode).toBe(400)
        expect(res.body.message).toBe("File is too large (max 10 MB)")
    })
})
