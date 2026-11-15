import request from "supertest"
import app from "@/app.js"
import { prisma } from "@/tests/jest.setup.js"
import { demoService } from "@/services/demoService.js"
import { loadDemoFixture } from "@/tests/fixtures/demo/seedDemoMedia.js"

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

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

describe("Collection Endpoints and Features", () => {
    let tokenA: string
    let userAId: number
    let tokenB: string
    let userBId: number
    let mediaTypeA: { id: number; name: string }
    let media1: { id: number; title: string }
    let media2: { id: number; title: string }
    let media3: { id: number; title: string }
    let log1Id: number
    let log2Id: number
    let log3Id: number
    let logBId: number

    beforeAll(async () => {
        const uA = await registerAndLogin("ColUserA")
        tokenA = uA.token
        userAId = uA.userId

        const uB = await registerAndLogin("ColUserB")
        tokenB = uB.token
        userBId = uB.userId

        mediaTypeA = await prisma.mediaType.create({
            data: { name: "colbook", userId: userAId },
        })

        media1 = await prisma.media.create({
            data: {
                title: "Col Book 1",
                imageUrl: "https://example.com/cover1.jpg",
                mediaTypeId: mediaTypeA.id,
                userId: userAId,
                source: "custom",
            },
        })
        media2 = await prisma.media.create({
            data: {
                title: "Col Book 2",
                imageUrl: "https://example.com/cover2.jpg",
                mediaTypeId: mediaTypeA.id,
                userId: userAId,
                source: "custom",
            },
        })
        media3 = await prisma.media.create({
            data: {
                title: "Col Book 3",
                imageUrl: "https://example.com/cover3.jpg",
                mediaTypeId: mediaTypeA.id,
                userId: userAId,
                source: "custom",
            },
        })

        const l1 = await prisma.userLogs.create({
            data: { userId: userAId, mediaId: media1.id, status: "Completed", rating: 90 },
        })
        log1Id = l1.id

        const l2 = await prisma.userLogs.create({
            data: { userId: userAId, mediaId: media2.id, status: "In progress", rating: 80 },
        })
        log2Id = l2.id

        const l3 = await prisma.userLogs.create({
            data: { userId: userAId, mediaId: media3.id, status: "Wishlist", rating: null },
        })
        log3Id = l3.id

        const mediaB = await prisma.media.create({
            data: {
                title: "Col Book B",
                mediaTypeId: mediaTypeA.id,
                userId: userBId,
                source: "custom",
            },
        })
        const lB = await prisma.userLogs.create({
            data: { userId: userBId, mediaId: mediaB.id, status: "Completed" },
        })
        logBId = lB.id
    })

    afterAll(async () => {
        await prisma.collectionItem.deleteMany({
            where: { collection: { userId: { in: [userAId, userBId] } } },
        })
        await prisma.collection.deleteMany({
            where: { userId: { in: [userAId, userBId] } },
        })
        await prisma.userLogs.deleteMany({
            where: { userId: { in: [userAId, userBId] } },
        })
        await prisma.media.deleteMany({
            where: { userId: { in: [userAId, userBId] } },
        })
        await prisma.mediaType.deleteMany({
            where: { userId: { in: [userAId, userBId] } },
        })
        await prisma.user.deleteMany({
            where: { id: { in: [userAId, userBId] } },
        })
    })

    describe("CRUD, validation, and name uniqueness", () => {
        let createdColId: number

        test("POST /collections creates a new collection", async () => {
            const res = await request(app)
                .post("/collections")
                .set(auth(tokenA))
                .send({
                    name: "  Top   Favorites  ",
                    description: "  My all-time favorite books  ",
                    ranked: true,
                })

            expect(res.statusCode).toBe(201)
            expect(res.body.name).toBe("Top Favorites")
            expect(res.body.description).toBe("My all-time favorite books")
            expect(res.body.ranked).toBe(true)
            expect(res.body.id).toBeDefined()
            createdColId = res.body.id
        })

        test("POST /collections rejects empty or invalid name", async () => {
            const res = await request(app)
                .post("/collections")
                .set(auth(tokenA))
                .send({ name: "   " })

            expect(res.statusCode).toBe(400)
        })

        test("POST /collections rejects duplicate name case-insensitively with 409 and id", async () => {
            const res = await request(app)
                .post("/collections")
                .set(auth(tokenA))
                .send({ name: "top favorites" })

            expect(res.statusCode).toBe(409)
            expect(res.body.id).toBe(createdColId)
            expect(res.body.name).toBe("Top Favorites")
        })

        test("GET /collections returns summary list sorted by updated_at desc", async () => {
            const res = await request(app)
                .get("/collections")
                .set(auth(tokenA))

            expect(res.statusCode).toBe(200)
            expect(Array.isArray(res.body)).toBe(true)
            const found = res.body.find((c: { id: number }) => c.id === createdColId)
            expect(found).toBeDefined()
            expect(found.count).toBe(0)
            expect(found.covers).toEqual([])
        })

        test("GET /collections/:id returns detail with items", async () => {
            const res = await request(app)
                .get(`/collections/${createdColId}`)
                .set(auth(tokenA))

            expect(res.statusCode).toBe(200)
            expect(res.body.id).toBe(createdColId)
            expect(res.body.name).toBe("Top Favorites")
            expect(res.body.ranked).toBe(true)
            expect(res.body.items).toEqual([])
        })

        test("PATCH /collections/:id updates name, description, and ranked without wiping omitted description", async () => {
            const descCol = await request(app)
                .post("/collections")
                .set(auth(tokenA))
                .send({
                    name: "Desc Test Col",
                    description: "Original description",
                    ranked: false,
                })
            expect(descCol.statusCode).toBe(201)

            // PATCH only ranked: description must NOT be wiped
            const patchRanked = await request(app)
                .patch(`/collections/${descCol.body.id}`)
                .set(auth(tokenA))
                .send({ ranked: true })
            expect(patchRanked.statusCode).toBe(200)
            expect(patchRanked.body.ranked).toBe(true)
            expect(patchRanked.body.description).toBe("Original description")

            // PATCH only name: description must NOT be wiped
            const patchName = await request(app)
                .patch(`/collections/${descCol.body.id}`)
                .set(auth(tokenA))
                .send({ name: "Desc Test Col Renamed" })
            expect(patchName.statusCode).toBe(200)
            expect(patchName.body.name).toBe("Desc Test Col Renamed")
            expect(patchName.body.description).toBe("Original description")

            // Verify with GET
            const getCheck = await request(app)
                .get(`/collections/${descCol.body.id}`)
                .set(auth(tokenA))
            expect(getCheck.body.description).toBe("Original description")

            // PATCH description: null clears it
            const patchClearNull = await request(app)
                .patch(`/collections/${descCol.body.id}`)
                .set(auth(tokenA))
                .send({ description: null })
            expect(patchClearNull.statusCode).toBe(200)
            expect(patchClearNull.body.description).toBeNull()

            // Reset description
            await request(app)
                .patch(`/collections/${descCol.body.id}`)
                .set(auth(tokenA))
                .send({ description: "Restored description" })

            // PATCH description: "" clears it
            const patchClearEmpty = await request(app)
                .patch(`/collections/${descCol.body.id}`)
                .set(auth(tokenA))
                .send({ description: "" })
            expect(patchClearEmpty.statusCode).toBe(200)
            expect(patchClearEmpty.body.description).toBeNull()

            await request(app).delete(`/collections/${descCol.body.id}`).set(auth(tokenA))
        })

        test("PATCH /collections/:id collision gives 409", async () => {
            const col2 = await request(app)
                .post("/collections")
                .set(auth(tokenA))
                .send({ name: "Second Shelf" })
            expect(col2.statusCode).toBe(201)

            const res = await request(app)
                .patch(`/collections/${createdColId}`)
                .set(auth(tokenA))
                .send({ name: "second shelf" })

            expect(res.statusCode).toBe(409)
            expect(res.body.id).toBe(col2.body.id)

            await request(app)
                .delete(`/collections/${col2.body.id}`)
                .set(auth(tokenA))
        })

        test("DELETE /collections/:id deletes collection without touching logs", async () => {
            const temp = await request(app)
                .post("/collections")
                .set(auth(tokenA))
                .send({ name: "Temporary" })
            expect(temp.statusCode).toBe(201)

            const delRes = await request(app)
                .delete(`/collections/${temp.body.id}`)
                .set(auth(tokenA))
            expect(delRes.statusCode).toBe(204)

            const getRes = await request(app)
                .get(`/collections/${temp.body.id}`)
                .set(auth(tokenA))
            expect(getRes.statusCode).toBe(404)
        })
    })

    describe("User isolation", () => {
        let colAId: number

        beforeAll(async () => {
            const res = await request(app)
                .post("/collections")
                .set(auth(tokenA))
                .send({ name: "UserA Secret List" })
            colAId = res.body.id
        })

        test("UserB cannot access UserA's collection (404)", async () => {
            const getRes = await request(app).get(`/collections/${colAId}`).set(auth(tokenB))
            expect(getRes.statusCode).toBe(404)

            const patchRes = await request(app).patch(`/collections/${colAId}`).set(auth(tokenB)).send({ name: "Hacked" })
            expect(patchRes.statusCode).toBe(404)

            const delRes = await request(app).delete(`/collections/${colAId}`).set(auth(tokenB))
            expect(delRes.statusCode).toBe(404)

            const addRes = await request(app).post(`/collections/${colAId}/items`).set(auth(tokenB)).send({ logId: logBId })
            expect(addRes.statusCode).toBe(404)
        })

        test("UserA cannot add UserB's log to their collection (404)", async () => {
            const res = await request(app)
                .post(`/collections/${colAId}/items`)
                .set(auth(tokenA))
                .send({ logId: logBId })

            expect(res.statusCode).toBe(404)
        })
    })

    describe("Collection items: add, remove, dense positions, and order permutation", () => {
        let colId: number

        beforeAll(async () => {
            const res = await request(app)
                .post("/collections")
                .set(auth(tokenA))
                .send({ name: "Item Test Col", ranked: true })
            colId = res.body.id
        })

        test("POST /collections/:id/items appends at dense positions", async () => {
            const r1 = await request(app).post(`/collections/${colId}/items`).set(auth(tokenA)).send({ logId: log1Id })
            expect(r1.statusCode).toBe(201)
            expect(r1.body.position).toBe(0)

            const r2 = await request(app).post(`/collections/${colId}/items`).set(auth(tokenA)).send({ logId: log2Id })
            expect(r2.statusCode).toBe(201)
            expect(r2.body.position).toBe(1)

            const r3 = await request(app).post(`/collections/${colId}/items`).set(auth(tokenA)).send({ logId: log3Id })
            expect(r3.statusCode).toBe(201)
            expect(r3.body.position).toBe(2)
        })

        test("POST /collections/:id/items rejects duplicate item with 409", async () => {
            const res = await request(app)
                .post(`/collections/${colId}/items`)
                .set(auth(tokenA))
                .send({ logId: log2Id })

            expect(res.statusCode).toBe(409)
        })

        test("GET /collections/:id returns items in position order with full log shape", async () => {
            const res = await request(app).get(`/collections/${colId}`).set(auth(tokenA))
            expect(res.statusCode).toBe(200)
            expect(res.body.items).toHaveLength(3)
            expect(res.body.items[0].position).toBe(0)
            expect(res.body.items[0].log.id).toBe(log1Id)
            expect(res.body.items[0].log.media.title).toBe("Col Book 1")
            expect(res.body.items[0].log.collectionIds).toContain(colId)
            expect(res.body.items[1].position).toBe(1)
            expect(res.body.items[2].position).toBe(2)
        })

        test("GET /collections returns covers and count", async () => {
            const res = await request(app).get("/collections").set(auth(tokenA))
            expect(res.statusCode).toBe(200)
            const found = res.body.find((c: { id: number }) => c.id === colId)
            expect(found.count).toBe(3)
            expect(found.covers).toEqual([
                "https://example.com/cover1.jpg",
                "https://example.com/cover2.jpg",
                "https://example.com/cover3.jpg",
            ])
        })

        test("GET /logs includes collectionIds", async () => {
            const res = await request(app).get("/logs").set(auth(tokenA))
            expect(res.statusCode).toBe(200)
            const log1 = res.body.find((l: { id: number }) => l.id === log1Id)
            expect(log1).toBeDefined()
            expect(Array.isArray(log1.collectionIds)).toBe(true)
            expect(log1.collectionIds).toContain(colId)
        })

        test("PUT /collections/:id/order validates permutation and updates positions", async () => {
            // Missing id -> 400
            const missing = await request(app).put(`/collections/${colId}/order`).set(auth(tokenA)).send({ logIds: [log1Id, log2Id] })
            expect(missing.statusCode).toBe(400)

            // Extra id -> 400
            const extra = await request(app).put(`/collections/${colId}/order`).set(auth(tokenA)).send({ logIds: [log1Id, log2Id, log3Id, 99999] })
            expect(extra.statusCode).toBe(400)

            // Duplicate id -> 400
            const dup = await request(app).put(`/collections/${colId}/order`).set(auth(tokenA)).send({ logIds: [log1Id, log1Id, log2Id] })
            expect(dup.statusCode).toBe(400)

            // Valid permutation: [log3Id, log1Id, log2Id]
            const valid = await request(app).put(`/collections/${colId}/order`).set(auth(tokenA)).send({ logIds: [log3Id, log1Id, log2Id] })
            expect(valid.statusCode).toBe(200)

            const check = await request(app).get(`/collections/${colId}`).set(auth(tokenA))
            expect(check.body.items[0].log.id).toBe(log3Id)
            expect(check.body.items[0].position).toBe(0)
            expect(check.body.items[1].log.id).toBe(log1Id)
            expect(check.body.items[1].position).toBe(1)
            expect(check.body.items[2].log.id).toBe(log2Id)
            expect(check.body.items[2].position).toBe(2)
        })

        test("DELETE /collections/:id/items/:logId re-densifies remaining positions", async () => {
            // Current order: log3 (pos 0), log1 (pos 1), log2 (pos 2).
            // Remove log1 (middle)
            const delRes = await request(app).delete(`/collections/${colId}/items/${log1Id}`).set(auth(tokenA))
            expect(delRes.statusCode).toBe(204)

            const check = await request(app).get(`/collections/${colId}`).set(auth(tokenA))
            expect(check.body.items).toHaveLength(2)
            expect(check.body.items[0].log.id).toBe(log3Id)
            expect(check.body.items[0].position).toBe(0)
            expect(check.body.items[1].log.id).toBe(log2Id)
            expect(check.body.items[1].position).toBe(1)
        })
    })

    describe("Cascades on log deletion and user deletion", () => {
        test("deleting a log removes it from collections and re-densifies positions", async () => {
            const col = await request(app).post("/collections").set(auth(tokenA)).send({ name: "Cascade Test" })
            const colId = col.body.id

            // Create 3 temporary logs
            const m1 = await prisma.media.create({ data: { title: "Del M1", userId: userAId, source: "custom" } })
            const m2 = await prisma.media.create({ data: { title: "Del M2", userId: userAId, source: "custom" } })
            const m3 = await prisma.media.create({ data: { title: "Del M3", userId: userAId, source: "custom" } })

            const l1 = await prisma.userLogs.create({ data: { userId: userAId, mediaId: m1.id, status: "Wishlist" } })
            const l2 = await prisma.userLogs.create({ data: { userId: userAId, mediaId: m2.id, status: "Wishlist" } })
            const l3 = await prisma.userLogs.create({ data: { userId: userAId, mediaId: m3.id, status: "Wishlist" } })

            await request(app).post(`/collections/${colId}/items`).set(auth(tokenA)).send({ logId: l1.id })
            await request(app).post(`/collections/${colId}/items`).set(auth(tokenA)).send({ logId: l2.id })
            await request(app).post(`/collections/${colId}/items`).set(auth(tokenA)).send({ logId: l3.id })

            // Delete log2 via log delete endpoint (requires confirm: true)
            const delLogRes = await request(app).delete(`/logs/${l2.id}`).set(auth(tokenA)).send({ confirm: true })
            expect(delLogRes.statusCode).toBe(200)

            const check = await request(app).get(`/collections/${colId}`).set(auth(tokenA))
            expect(check.body.items).toHaveLength(2)
            expect(check.body.items[0].log.id).toBe(l1.id)
            expect(check.body.items[0].position).toBe(0)
            expect(check.body.items[1].log.id).toBe(l3.id)
            expect(check.body.items[1].position).toBe(1)
        })

        test("deleting user removes collections and items", async () => {
            const u = await registerAndLogin("ColUserDel")
            const col = await request(app).post("/collections").set(auth(u.token)).send({ name: "User Del Col" })
            const m = await prisma.media.create({ data: { title: "DelUser M", userId: u.userId, source: "custom" } })
            const l = await prisma.userLogs.create({ data: { userId: u.userId, mediaId: m.id, status: "Wishlist" } })
            await request(app).post(`/collections/${col.body.id}/items`).set(auth(u.token)).send({ logId: l.id })

            await prisma.user.delete({ where: { id: u.userId } })

            const checkCol = await prisma.collection.findUnique({ where: { id: col.body.id } })
            expect(checkCol).toBeNull()
            const checkItem = await prisma.collectionItem.findFirst({ where: { collectionId: col.body.id } })
            expect(checkItem).toBeNull()
        })
    })

    describe("Limits: max 200 collections, max 1000 items", () => {
        test("enforces maximum 200 collections per user", async () => {
            const u = await registerAndLogin("ColLimitUser")
            // Insert 200 collections directly into DB
            const data: { userId: number; name: string; nameKey: string }[] = []
            for (let i = 0; i < 200; i++) {
                data.push({
                    userId: u.userId,
                    name: `Col ${i}`,
                    nameKey: `col ${i}`,
                })
            }
            await prisma.collection.createMany({ data })

            const res = await request(app)
                .post("/collections")
                .set(auth(u.token))
                .send({ name: "Collection 201" })

            expect(res.statusCode).toBe(400)
            expect(res.body.message).toMatch(/Maximum 200 collections/)

            await prisma.collection.deleteMany({ where: { userId: u.userId } })
            await prisma.user.delete({ where: { id: u.userId } })
        })
    })

    describe("Demo user reset clears collections", () => {
        test("resetDemoUser removes demo collections", async () => {
            const fixture = loadDemoFixture()
            const expectedCount = fixture.collections.length + 1 // +1 for "Letterboxd likes" created by Letterboxd export
            const demo = await prisma.user.findUnique({ where: { username: "demo" } })
            if (demo) {
                await prisma.collection.create({
                    data: {
                        userId: demo.id,
                        name: "Demo Shelf",
                        nameKey: "demo shelf",
                    },
                })
                await demoService.resetDemoUser()
                const demoShelf = await prisma.collection.findFirst({
                    where: { userId: demo.id, name: "Demo Shelf" },
                })
                expect(demoShelf).toBeNull()

                const count = await prisma.collection.count({ where: { userId: demo.id } })
                expect(count).toBe(expectedCount)
            }
        })
    })

    describe("Concurrency", () => {
        test("two parallel POST /collections with the same name yields exactly one 201 and one 409", async () => {
            const [r1, r2] = await Promise.all([
                request(app).post("/collections").set(auth(tokenA)).send({ name: "Parallel Col" }),
                request(app).post("/collections").set(auth(tokenA)).send({ name: "parallel col" }),
            ])
            const statuses = [r1.statusCode, r2.statusCode].sort()
            expect(statuses).toEqual([201, 409])
            const created = r1.statusCode === 201 ? r1.body : r2.body
            const collided = r1.statusCode === 409 ? r1.body : r2.body
            expect(collided.id).toBe(created.id)

            await request(app).delete(`/collections/${created.id}`).set(auth(tokenA))
        })

        test("two parallel adds of the same log yields exactly one 201 and one 409", async () => {
            const col = await request(app).post("/collections").set(auth(tokenA)).send({ name: "Parallel Add Same Log" })
            expect(col.statusCode).toBe(201)

            const [r1, r2] = await Promise.all([
                request(app).post(`/collections/${col.body.id}/items`).set(auth(tokenA)).send({ logId: log1Id }),
                request(app).post(`/collections/${col.body.id}/items`).set(auth(tokenA)).send({ logId: log1Id }),
            ])
            const statuses = [r1.statusCode, r2.statusCode].sort()
            expect(statuses).toEqual([201, 409])

            await request(app).delete(`/collections/${col.body.id}`).set(auth(tokenA))
        })

        test("10 parallel adds of different logs yields dense positions 0..9 without duplicates", async () => {
            const col = await request(app).post("/collections").set(auth(tokenA)).send({ name: "Parallel 10 Logs", ranked: true })
            expect(col.statusCode).toBe(201)

            const logs: { id: number }[] = []
            for (let i = 0; i < 10; i++) {
                const med = await prisma.media.create({
                    data: { title: `P-Log Media ${i}`, userId: userAId, mediaTypeId: mediaTypeA.id, source: "custom" }
                })
                const l = await prisma.userLogs.create({
                    data: { userId: userAId, mediaId: med.id, status: "Completed" }
                })
                logs.push(l)
            }

            const results = await Promise.all(
                logs.map(l => request(app).post(`/collections/${col.body.id}/items`).set(auth(tokenA)).send({ logId: l.id }))
            )
            for (const r of results) {
                expect(r.statusCode).toBe(201)
            }

            const check = await request(app).get(`/collections/${col.body.id}`).set(auth(tokenA))
            expect(check.body.items).toHaveLength(10)
            const positions = check.body.items.map((it: { position: number }) => it.position)
            expect(positions).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])

            await request(app).delete(`/collections/${col.body.id}`).set(auth(tokenA))
        })

        test("two parallel PATCH renames to the same target name yield one 200 and one 409", async () => {
            const target = await request(app).post("/collections").set(auth(tokenA)).send({ name: "Existing Target" })
            const colToRename = await request(app).post("/collections").set(auth(tokenA)).send({ name: "To Rename" })

            const [r1, r2] = await Promise.all([
                request(app).patch(`/collections/${colToRename.body.id}`).set(auth(tokenA)).send({ name: "existing target" }),
                request(app).patch(`/collections/${colToRename.body.id}`).set(auth(tokenA)).send({ name: "Existing Target" }),
            ])
            expect([r1.statusCode, r2.statusCode]).toEqual([409, 409])

            await request(app).delete(`/collections/${target.body.id}`).set(auth(tokenA))
            await request(app).delete(`/collections/${colToRename.body.id}`).set(auth(tokenA))
        })
    })
})
