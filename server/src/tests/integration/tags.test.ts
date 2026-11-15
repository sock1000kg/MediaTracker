import request from "supertest"
import app from "@/app.js"
import { prisma } from "@/tests/jest.setup.js"
import { demoService } from "@/services/demoService.js"
import { loadDemoFixture } from "@/tests/fixtures/demo/seedDemoMedia.js"
import { tagKey, normalizeTagName } from "@/utilities.js"
import fs from "fs"
import path from "path"
import { parseMalExport } from "@/services/imports/malImportService.js"
import { unzipLetterboxdExport, mergeLetterboxdFiles } from "@/services/imports/letterboxdImportService.js"

async function registerAndLogin(username: string) {
    await request(app)
        .post("/auth/register")
        .send({ username, password: "StrongPass1!", displayName: username, registerKey: process.env.REGISTER_KEY })
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

describe("Tag Endpoints and Log Tags", () => {
    let tokenA: string
    let userAId: string
    let tokenB: string
    let userBId: string
    let mediaTypeA: { id: string; name: string }
    let mediaA: { id: string; title: string }

    beforeAll(async () => {
        const uA = await registerAndLogin("TagUserA")
        tokenA = uA.token
        userAId = uA.userId

        const uB = await registerAndLogin("TagUserB")
        tokenB = uB.token
        userBId = uB.userId

        mediaTypeA = await prisma.mediaType.create({
            data: { name: "tagbook", userId: userAId }
        })

        mediaA = await prisma.media.create({
            data: {
                title: "Tag Book 1",
                mediaTypeId: mediaTypeA.id,
                userId: userAId,
                source: "custom"
            }
        })
    })

    afterAll(async () => {
        await prisma.logTag.deleteMany({ where: { log: { userId: { in: [userAId, userBId] } } } })
        await prisma.tag.deleteMany({ where: { userId: { in: [userAId, userBId] } } })
        await prisma.userLogs.deleteMany({ where: { userId: { in: [userAId, userBId] } } })
        await prisma.media.deleteMany({ where: { userId: { in: [userAId, userBId] } } })
        await prisma.mediaType.deleteMany({ where: { userId: { in: [userAId, userBId] } } })
        await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } })
    })

    describe("CRUD /tags endpoints", () => {
        test("GET /tags initially returns empty array", async () => {
            const res = await request(app)
                .get("/tags")
                .set("Authorization", `Bearer ${tokenA}`)
            expect(res.statusCode).toBe(200)
            expect(res.body).toEqual([])
        })

        test("POST /tags creates a tag, strips leading # and trims", async () => {
            const res = await request(app)
                .post("/tags")
                .set("Authorization", `Bearer ${tokenA}`)
                .send({ name: "  ##Sci-Fi Favorites  " })

            expect(res.statusCode).toBe(201)
            expect(res.body.name).toBe("Sci-Fi Favorites")
            expect(res.body.id).toBeDefined()
        })

        test("POST /tags returns 409 if nameKey already exists", async () => {
            const res = await request(app)
                .post("/tags")
                .set("Authorization", `Bearer ${tokenA}`)
                .send({ name: "sci-fi   favorites" })

            expect(res.statusCode).toBe(409)
            expect(res.body.name).toBe("Sci-Fi Favorites")
        })

        test("POST /tags validates invalid names", async () => {
            // empty or only hashes
            const res1 = await request(app)
                .post("/tags")
                .set("Authorization", `Bearer ${tokenA}`)
                .send({ name: "###" })
            expect(res1.statusCode).toBe(400)

            // comma in name
            const res2 = await request(app)
                .post("/tags")
                .set("Authorization", `Bearer ${tokenA}`)
                .send({ name: "sci-fi, fantasy" })
            expect(res2.statusCode).toBe(400)

            // > 40 chars
            const res3 = await request(app)
                .post("/tags")
                .set("Authorization", `Bearer ${tokenA}`)
                .send({ name: "a".repeat(41) })
            expect(res3.statusCode).toBe(400)
        })

        test("User isolation: User B can create same tag name", async () => {
            const res = await request(app)
                .post("/tags")
                .set("Authorization", `Bearer ${tokenB}`)
                .send({ name: "Sci-Fi Favorites" })

            expect(res.statusCode).toBe(201)
            expect(res.body.name).toBe("Sci-Fi Favorites")
        })

        test("PATCH /tags/:id renames and allows changing case", async () => {
            const listRes = await request(app)
                .get("/tags")
                .set("Authorization", `Bearer ${tokenA}`)
            const tag = (listRes.body as { id: string; name: string }[]).find((t) => t.name === "Sci-Fi Favorites")!

            // Changing case of same tag
            const res1 = await request(app)
                .patch(`/tags/${tag.id}`)
                .set("Authorization", `Bearer ${tokenA}`)
                .send({ name: "sci-fi favorites" })
            expect(res1.statusCode).toBe(200)
            expect(res1.body.name).toBe("sci-fi favorites")

            // Create another tag
            await request(app)
                .post("/tags")
                .set("Authorization", `Bearer ${tokenA}`)
                .send({ name: "Cyberpunk" })

            // Colliding rename -> 409
            const res2 = await request(app)
                .patch(`/tags/${tag.id}`)
                .set("Authorization", `Bearer ${tokenA}`)
                .send({ name: "CYBERPUNK" })
            expect(res2.statusCode).toBe(409)

            // Other user's tag gives 404
            const res3 = await request(app)
                .patch(`/tags/${tag.id}`)
                .set("Authorization", `Bearer ${tokenB}`)
                .send({ name: "Hacked" })
            expect(res3.statusCode).toBe(404)
        })

        test("DELETE /tags/:id deletes tag and gives 404 for other user", async () => {
            const listRes = await request(app)
                .get("/tags")
                .set("Authorization", `Bearer ${tokenA}`)
            const cyberTag = (listRes.body as { id: string; name: string }[]).find((t) => t.name === "Cyberpunk")!

            // Other user delete gives 404
            const badDel = await request(app)
                .delete(`/tags/${cyberTag.id}`)
                .set("Authorization", `Bearer ${tokenB}`)
            expect(badDel.statusCode).toBe(404)

            // Owner delete gives 204
            const goodDel = await request(app)
                .delete(`/tags/${cyberTag.id}`)
                .set("Authorization", `Bearer ${tokenA}`)
            expect(goodDel.statusCode).toBe(204)
        })
    })

    describe("Tags on logs (set semantics, auto-creation, limits)", () => {
        let logId: string

        test("POST /logs with tags auto-creates unknown tags and links them", async () => {
            const res = await request(app)
                .post("/logs")
                .set("Authorization", `Bearer ${tokenA}`)
                .send({
                    mediaId: mediaA.id,
                    status: "completed",
                    rating: 90,
                    tags: ["#Classic", "Dystopia", "dystopia", "sci-fi favorites"] // duplicate case-insensitive
                })

            expect(res.statusCode).toBe(201)
            logId = res.body.id
            expect(res.body.tags).toHaveLength(3)
            expect((res.body.tags as { name: string }[]).map((t) => t.name)).toEqual(["Classic", "Dystopia", "sci-fi favorites"])

            // Verify GET /logs returns tags sorted by name
            const getRes = await request(app)
                .get("/logs")
                .set("Authorization", `Bearer ${tokenA}`)
            const found = (getRes.body as { id: string; tags: { name: string }[] }[]).find((l) => l.id === logId)!
            expect(found.tags.map((t) => t.name)).toEqual(["Classic", "Dystopia", "sci-fi favorites"])
        })

        test("GET /tags returns counts of logs using each tag", async () => {
            const res = await request(app)
                .get("/tags")
                .set("Authorization", `Bearer ${tokenA}`)
            expect(res.statusCode).toBe(200)
            const dystopia = (res.body as { name: string; count: number }[]).find((t) => t.name === "Dystopia")!
            expect(dystopia.count).toBe(1)
        })

        test("PUT /logs/:id with tags replaces the tag set", async () => {
            const res = await request(app)
                .put(`/logs/${logId}`)
                .set("Authorization", `Bearer ${tokenA}`)
                .send({
                    tags: ["Philosophy"]
                })

            expect(res.statusCode).toBe(200)
            expect((res.body.tags as { name: string }[]).map((t) => t.name)).toEqual(["Philosophy"])
        })

        test("PUT /logs/:id omitting tags leaves them unchanged", async () => {
            const res = await request(app)
                .put(`/logs/${logId}`)
                .set("Authorization", `Bearer ${tokenA}`)
                .send({
                    rating: 95
                })

            expect(res.statusCode).toBe(200)
            expect((res.body.tags as { name: string }[]).map((t) => t.name)).toEqual(["Philosophy"])
        })

        test("PUT /logs/:id with empty array tags clears all tags", async () => {
            const res = await request(app)
                .put(`/logs/${logId}`)
                .set("Authorization", `Bearer ${tokenA}`)
                .send({
                    tags: []
                })

            expect(res.statusCode).toBe(200)
            expect(res.body.tags).toEqual([])
        })

        test("Limits: more than 20 tags on log rejected with 400", async () => {
            const tooMany = Array.from({ length: 21 }, (_, i) => `Tag${i}`)
            const res = await request(app)
                .put(`/logs/${logId}`)
                .set("Authorization", `Bearer ${tokenA}`)
                .send({
                    tags: tooMany
                })

            expect(res.statusCode).toBe(400)
        })

        test("Deleting a log removes its LogTag rows; deleting a tag removes it from logs", async () => {
            // Set tags back on log
            await request(app)
                .put(`/logs/${logId}`)
                .set("Authorization", `Bearer ${tokenA}`)
                .send({ tags: ["TempTag1", "TempTag2"] })

            const tagRows = await prisma.logTag.findMany({ where: { logId } })
            expect(tagRows).toHaveLength(2)

            // Delete TempTag1
            const tag1 = await prisma.tag.findFirstOrThrow({ where: { userId: userAId, name: "TempTag1" } })
            const delRes = await request(app)
                .delete(`/tags/${tag1.id}`)
                .set("Authorization", `Bearer ${tokenA}`)
            expect(delRes.statusCode).toBe(204)

            // Log now only has TempTag2
            const logAfterTagDel = await prisma.userLogs.findUniqueOrThrow({
                where: { id: logId },
                include: { tags: { include: { tag: true } } }
            })
            expect(logAfterTagDel.tags.map(t => t.tag.name)).toEqual(["TempTag2"])

            // Delete the log
            await request(app)
                .delete(`/logs/${logId}`)
                .set("Authorization", `Bearer ${tokenA}`)
                .send({ confirm: true })

            const remainingLogTags = await prisma.logTag.findMany({ where: { logId } })
            expect(remainingLogTags).toHaveLength(0)

            // Tag TempTag2 still exists
            const tag2 = await prisma.tag.findFirst({ where: { userId: userAId, name: "TempTag2" } })
            expect(tag2).not.toBeNull()
        })

        test("PUT /media/media-log accepts tags on search media", async () => {
            const mediaData = {
                title: "Media Log Tag Test",
                creator: "Author",
                year: 2024,
                source: "google_books",
                sourceId: "gb-tag-search-1",
                mediaType: "book"
            }
            const logData = {
                status: "completed",
                rating: 88,
                tags: ["FromSearch", "QuickRead"]
            }

            const res = await request(app)
                .put("/media/media-log")
                .set("Authorization", `Bearer ${tokenA}`)
                .send({ mediaData, logData })

            expect(res.statusCode).toBe(201)
            expect((res.body.log.tags as { name: string }[]).map((t) => t.name)).toEqual(["FromSearch", "QuickRead"])

            // Update media-log with different tags
            const updateRes = await request(app)
                .put("/media/media-log")
                .set("Authorization", `Bearer ${tokenA}`)
                .send({ mediaData, logData: { status: "completed", tags: ["UpdatedSearch"] } })

            expect(updateRes.statusCode).toBe(201)
            expect((updateRes.body.log.tags as { name: string }[]).map((t) => t.name)).toEqual(["UpdatedSearch"])
        })
    })

    describe("Demo account reset and cascades", () => {
        test("Demo user can have tags and resetDemoUser deletes them", async () => {
            const fixture = loadDemoFixture()
            const animePath = path.resolve(process.cwd(), "src/tests/fixtures/demo/exports/mal-anime.xml")
            const mangaPath = path.resolve(process.cwd(), "src/tests/fixtures/demo/exports/mal-manga.xml")
            const animeEntries = fs.existsSync(animePath) ? parseMalExport(fs.readFileSync(animePath)).entries : []
            const mangaEntries = fs.existsSync(mangaPath) ? parseMalExport(fs.readFileSync(mangaPath)).entries : []
            const malTags = [...animeEntries.flatMap((e) => e.tags), ...mangaEntries.flatMap((e) => e.tags)]
            const letterboxdPath = path.resolve(process.cwd(), "src/tests/fixtures/demo/exports/letterboxd.zip")
            const letterboxdFilms = fs.existsSync(letterboxdPath)
                ? mergeLetterboxdFiles(unzipLetterboxdExport(fs.readFileSync(letterboxdPath)))
                : []
            const letterboxdTags = letterboxdFilms.flatMap((f) => f.tags)
            const allRawTags = [...fixture.items.flatMap((i) => i.log.tags || []), ...malTags, ...letterboxdTags]
            const expectedTagCount = new Set(
                allRawTags.map((t) => tagKey(normalizeTagName(t) ?? t))
            ).size

            // Find or create demo user
            let demo = await prisma.user.findUnique({ where: { username: "demo" } })
            if (!demo) {
                await request(app)
                    .post("/auth/register")
                    .send({ username: "demo", password: "StrongPass1!", displayName: "Demo User", registerKey: process.env.REGISTER_KEY })
                demo = await prisma.user.findUniqueOrThrow({ where: { username: "demo" } })
            }

            // Create tag for demo user
            await prisma.tag.create({
                data: { userId: demo.id, name: "DemoTag", nameKey: "demotag" }
            })

            const before = await prisma.tag.count({ where: { userId: demo.id } })
            expect(before).toBeGreaterThan(0)

            // Reset demo
            await demoService.resetDemoUser()

            const demoTag = await prisma.tag.findFirst({
                where: { userId: demo.id, name: "DemoTag" }
            })
            expect(demoTag).toBeNull()

            const after = await prisma.tag.count({ where: { userId: demo.id } })
            expect(after).toBe(expectedTagCount)
        })

        test("Deleting user cascades and deletes all tags and log tags", async () => {
            const u = await registerAndLogin("TagCascadeUser")
            const tag = await prisma.tag.create({
                data: { userId: u.userId, name: "CascadeTag", nameKey: "cascadetag" }
            })
            const mt = await prisma.mediaType.findFirstOrThrow({ where: { name: "book" } })
            const med = await prisma.media.create({
                data: { title: "CascadeBook", userId: u.userId, mediaTypeId: mt.id, source: "custom" }
            })
            const l = await prisma.userLogs.create({
                data: { userId: u.userId, mediaId: med.id, status: "completed" }
            })
            await prisma.logTag.create({
                data: { logId: l.id, tagId: tag.id }
            })

            await prisma.user.delete({ where: { id: u.userId } })

            expect(await prisma.tag.findUnique({ where: { id: tag.id } })).toBeNull()
            expect(await prisma.logTag.findMany({ where: { logId: l.id } })).toHaveLength(0)
        })

        test("Concurrent POST /tags with the same name yields one 201 and one 409", async () => {
            const [r1, r2] = await Promise.all([
                request(app).post("/tags").set("Authorization", `Bearer ${tokenA}`).send({ name: "RaceTag" }),
                request(app).post("/tags").set("Authorization", `Bearer ${tokenA}`).send({ name: "racetag" }),
            ])
            const statuses = [r1.statusCode, r2.statusCode].sort()
            expect(statuses).toEqual([201, 409])
            const created = r1.statusCode === 201 ? r1.body : r2.body
            const collided = r1.statusCode === 409 ? r1.body : r2.body
            expect(collided.id).toBe(created.id)
        })

        test("Concurrent log saves both introducing a new tag both succeed and share one tag", async () => {
            const m1 = await prisma.media.create({
                data: { title: "Comfort 1", userId: userAId, mediaTypeId: mediaTypeA.id, source: "custom" }
            })
            const m2 = await prisma.media.create({
                data: { title: "Comfort 2", userId: userAId, mediaTypeId: mediaTypeA.id, source: "custom" }
            })

            const [r1, r2] = await Promise.all([
                request(app).post("/logs").set("Authorization", `Bearer ${tokenA}`).send({ mediaId: m1.id, status: "completed", tags: ["comfort"] }),
                request(app).post("/logs").set("Authorization", `Bearer ${tokenA}`).send({ mediaId: m2.id, status: "completed", tags: ["comfort"] }),
            ])

            expect(r1.statusCode).toBe(201)
            expect(r2.statusCode).toBe(201)

            // Exactly one tag with nameKey "comfort" exists for userA
            const tags = await prisma.tag.findMany({ where: { userId: userAId, nameKey: "comfort" } })
            expect(tags).toHaveLength(1)

            // Both logs have the tag
            const l1 = await prisma.userLogs.findUnique({ where: { id: r1.body.id }, include: { tags: { include: { tag: true } } } })
            const l2 = await prisma.userLogs.findUnique({ where: { id: r2.body.id }, include: { tags: { include: { tag: true } } } })
            expect(l1?.tags.map(t => t.tag.name)).toContain("comfort")
            expect(l2?.tags.map(t => t.tag.name)).toContain("comfort")
        })
    })
})
