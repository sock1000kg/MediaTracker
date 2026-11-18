import request from "supertest"
import app from "@/app.js"
import { prisma } from "@/tests/jest.setup.js"

const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UUID_ANY_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const PW = "StrongPass1!"

async function registerAndLogin(username: string) {
    await request(app).post("/auth/register")
        .send({ username, password: PW, displayName: username, registerKey: process.env.REGISTER_KEY })
        .set("Content-Type", "application/json")
    const res = await request(app).post("/auth/login").send({ username, password: PW })
    return { token: res.body.accessToken as string, userId: res.body.user.id as string }
}

describe("UUID Acceptance Tests (S5)", () => {
    let tokenA: string
    let userAId: string
    let tokenB: string
    let userBId: string

    beforeAll(async () => {
        const uA = await registerAndLogin(`UuidUserA_${Date.now()}`)
        tokenA = uA.token
        userAId = uA.userId

        const uB = await registerAndLogin(`UuidUserB_${Date.now()}`)
        tokenB = uB.token
        userBId = uB.userId
    })

    afterAll(async () => {
        await prisma.collectionItem.deleteMany({ where: { collection: { userId: { in: [userAId, userBId] } } } })
        await prisma.collection.deleteMany({ where: { userId: { in: [userAId, userBId] } } })
        await prisma.logTag.deleteMany({ where: { log: { userId: { in: [userAId, userBId] } } } })
        await prisma.tag.deleteMany({ where: { userId: { in: [userAId, userBId] } } })
        await prisma.userLogs.deleteMany({ where: { userId: { in: [userAId, userBId] } } })
        await prisma.media.deleteMany({ where: { userId: { in: [userAId, userBId] } } })
        await prisma.mediaType.deleteMany({ where: { userId: { in: [userAId, userBId] } } })
        await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } })
    })

    describe("Malformed ID validation", () => {
        test("PUT /logs/:id returns 400 for non-UUID id", async () => {
            const res = await request(app).put("/logs/123").set("Authorization", `Bearer ${tokenA}`).send({ rating: 80 })
            expect(res.statusCode).toBe(400)
            expect(res.body.message).toMatch(/Invalid UUID/i)
        })

        test("DELETE /logs/:id returns 400 for non-UUID id", async () => {
            const res = await request(app).delete("/logs/not-a-uuid").set("Authorization", `Bearer ${tokenA}`).send({ confirm: true })
            expect(res.statusCode).toBe(400)
            expect(res.body.message).toMatch(/Invalid UUID/i)
        })

        test("GET /collections/:id returns 400 for non-UUID id", async () => {
            const res = await request(app).get("/collections/123").set("Authorization", `Bearer ${tokenA}`)
            expect(res.statusCode).toBe(400)
            expect(res.body.message).toMatch(/Invalid UUID/i)
        })

        test("PATCH /tags/:id returns 400 for non-UUID id", async () => {
            const res = await request(app).patch("/tags/xyz").set("Authorization", `Bearer ${tokenA}`).send({ name: "Tag" })
            expect(res.statusCode).toBe(400)
            expect(res.body.message).toMatch(/Invalid UUID/i)
        })

        test("GET /media/:id/children returns 400 for non-UUID id", async () => {
            const res = await request(app).get("/media/invalid/children").set("Authorization", `Bearer ${tokenA}`)
            expect(res.statusCode).toBe(400)
            expect(res.body.message).toMatch(/Invalid UUID/i)
        })

        test("PUT /media/:id returns 400 for non-UUID id", async () => {
            const res = await request(app).put("/media/invalid").set("Authorization", `Bearer ${tokenA}`).send({ title: "X", mediaType: "book" })
            expect(res.statusCode).toBe(400)
            expect(res.body.message).toMatch(/Invalid UUID/i)
        })

        test("DELETE /media/:id returns 400 for non-UUID id", async () => {
            const res = await request(app).delete("/media/invalid").set("Authorization", `Bearer ${tokenA}`)
            expect(res.statusCode).toBe(400)
            expect(res.body.message).toMatch(/Invalid UUID/i)
        })
    })

    describe("UUID format of created entities", () => {
        test("newly created user, media, log, collection, and tag have valid UUID v7 ids", async () => {
            expect(userAId).toMatch(UUID_V7_REGEX)

            const bookType = await prisma.mediaType.findFirst({ where: { name: "book" } })
            const media = await prisma.media.create({
                data: {
                    title: "UUID v7 Test Book",
                    userId: userAId,
                    mediaTypeId: bookType!.id,
                },
            })
            expect(media.id).toMatch(UUID_V7_REGEX)

            const logRes = await request(app).post("/logs").set("Authorization", `Bearer ${tokenA}`).send({
                mediaId: media.id,
                status: "completed",
                rating: 95,
            })
            expect(logRes.statusCode).toBe(201)
            expect(logRes.body.id).toMatch(UUID_V7_REGEX)
            expect(logRes.body.mediaId).toMatch(UUID_ANY_REGEX)

            const colRes = await request(app).post("/collections").set("Authorization", `Bearer ${tokenA}`).send({
                name: "UUID Test Collection",
            })
            expect(colRes.statusCode).toBe(201)
            expect(colRes.body.id).toMatch(UUID_V7_REGEX)

            const tagRes = await request(app).post("/tags").set("Authorization", `Bearer ${tokenA}`).send({
                name: "UUIDTag",
            })
            expect(tagRes.statusCode).toBe(201)
            expect(tagRes.body.id).toMatch(UUID_V7_REGEX)
        })
    })

    describe("Cross-user ownership isolation", () => {
        test("User B cannot modify or delete User A's log by UUID (403)", async () => {
            const bookType = await prisma.mediaType.findFirst({ where: { name: "book" } })
            const media = await prisma.media.create({
                data: {
                    title: "Isolation Book",
                    userId: userAId,
                    mediaTypeId: bookType!.id,
                },
            })
            const log = await prisma.userLogs.create({
                data: {
                    userId: userAId,
                    mediaId: media.id,
                    status: "completed",
                    rating: 90,
                },
            })

            const putRes = await request(app).put(`/logs/${log.id}`).set("Authorization", `Bearer ${tokenB}`).send({ rating: 10 })
            expect(putRes.statusCode).toBe(403)

            const delRes = await request(app).delete(`/logs/${log.id}`).set("Authorization", `Bearer ${tokenB}`).send({ confirm: true })
            expect(delRes.statusCode).toBe(403)
        })

        test("User B cannot modify or delete User A's custom media by UUID (403)", async () => {
            const bookType = await prisma.mediaType.findFirst({ where: { name: "book" } })
            const media = await prisma.media.create({
                data: {
                    title: "Private Media A",
                    userId: userAId,
                    mediaTypeId: bookType!.id,
                },
            })

            const putRes = await request(app).put(`/media/${media.id}`).set("Authorization", `Bearer ${tokenB}`).send({ title: "Hacked", mediaType: bookType })
            expect(putRes.statusCode).toBe(403)

            const delRes = await request(app).delete(`/media/${media.id}`).set("Authorization", `Bearer ${tokenB}`).send({ confirm: true })
            expect(delRes.statusCode).toBe(403)
        })

        test("User B cannot access or modify User A's collection by UUID", async () => {
            const col = await prisma.collection.create({
                data: {
                    name: "Private Col A",
                    nameKey: "private col a",
                    userId: userAId,
                },
            })

            const getRes = await request(app).get(`/collections/${col.id}`).set("Authorization", `Bearer ${tokenB}`)
            expect(getRes.statusCode).toBe(404)

            const patchRes = await request(app).patch(`/collections/${col.id}`).set("Authorization", `Bearer ${tokenB}`).send({ name: "Hacked" })
            expect(patchRes.statusCode).toBe(404)

            const delRes = await request(app).delete(`/collections/${col.id}`).set("Authorization", `Bearer ${tokenB}`)
            expect(delRes.statusCode).toBe(404)
        })

        test("User B cannot modify or delete User A's tag by UUID", async () => {
            const tag = await prisma.tag.create({
                data: {
                    name: "PrivateTagA",
                    nameKey: "privatetaga",
                    userId: userAId,
                },
            })

            const patchRes = await request(app).patch(`/tags/${tag.id}`).set("Authorization", `Bearer ${tokenB}`).send({ name: "Hacked" })
            expect(patchRes.statusCode).toBe(404)

            const delRes = await request(app).delete(`/tags/${tag.id}`).set("Authorization", `Bearer ${tokenB}`)
            expect(delRes.statusCode).toBe(404)
        })
    })

    describe("Deterministic log ordering with id tie-breaker", () => {
        test("two logs with identical logged_at timestamps maintain deterministic ordering using id tie-breaker", async () => {
            const bookType = await prisma.mediaType.findFirst({ where: { name: "book" } })
            const fixedDate = new Date("2026-06-15T12:00:00.000Z")

            const m1 = await prisma.media.create({
                data: { title: "Order Book 1", userId: userAId, mediaTypeId: bookType!.id },
            })
            const m2 = await prisma.media.create({
                data: { title: "Order Book 2", userId: userAId, mediaTypeId: bookType!.id },
            })

            const l1 = await prisma.userLogs.create({
                data: { userId: userAId, mediaId: m1.id, status: "completed", logged_at: fixedDate },
            })
            const l2 = await prisma.userLogs.create({
                data: { userId: userAId, mediaId: m2.id, status: "completed", logged_at: fixedDate },
            })

            // Query logs multiple times to ensure deterministic ordering
            const res1 = await request(app).get("/logs").set("Authorization", `Bearer ${tokenA}`)
            const res2 = await request(app).get("/logs").set("Authorization", `Bearer ${tokenA}`)

            const ids1 = (res1.body as Array<{ id: string }>).map(l => l.id)
            const ids2 = (res2.body as Array<{ id: string }>).map(l => l.id)

            expect(ids1).toEqual(ids2)

            const idx1 = ids1.indexOf(l1.id)
            const idx2 = ids1.indexOf(l2.id)
            expect(idx1).toBeGreaterThanOrEqual(0)
            expect(idx2).toBeGreaterThanOrEqual(0)

            // Since logged_at is identical and secondary sort is id: 'asc':
            const expectedOrder = l1.id < l2.id ? [l1.id, l2.id] : [l2.id, l1.id]
            const actualOrder = [ids1[Math.min(idx1, idx2)], ids1[Math.max(idx1, idx2)]]
            expect(actualOrder).toEqual(expectedOrder)
        })
    })
})
