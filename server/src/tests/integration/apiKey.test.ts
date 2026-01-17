import request from "supertest"
import app from "@/app.js"
import { prisma } from "@/tests/jest.setup.js"

const API = "/api-key"

// Utility: create + login user → returns token + userId
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

describe("API Key Routes", () => {
    let token: string
    let userId: number

    beforeAll(async () => {
        const result = await registerAndLogin("ApiKeyUser")
        token = result.token
        userId = result.userId
    })

    afterAll(async () => {
        await prisma.userAPIKey.deleteMany({ where: { userId } })
        await prisma.user.deleteMany({ where: { id: userId } })
    })

    // --------------------------------------------------------
    // GET /apikeys
    // --------------------------------------------------------
    test("GET /apikeys returns 404 if user has no API keys", async () => {
        const res = await request(app)
            .get(API)
            .set("Authorization", `Bearer ${token}`)

        expect(res.statusCode).toBe(404)
        expect(res.body.message).toMatch(/no api keys/i)
    })

    // --------------------------------------------------------
    // POST /apikeys
    // --------------------------------------------------------
    test("POST /apikeys creates API key successfully", async () => {
        const res = await request(app)
            .post(API)
            .send({ service: "google_books", key: "sk-test-123" })
            .set("Authorization", `Bearer ${token}`)
            .set("Content-Type", "application/json")

        expect(res.statusCode).toBe(201)
        expect(res.body).toHaveProperty("service", "google_books")
    })

    test("POST /apikeys returns 409 if service already exists", async () => {
        // First creation
        await request(app)
            .post(API)
            .send({ service: "google_books", key: "abc123" })
            .set("Authorization", `Bearer ${token}`)

        // Duplicate
        const res = await request(app)
            .post(API)
            .send({ service: "google_books", key: "abc123" })
            .set("Authorization", `Bearer ${token}`)

        expect(res.statusCode).toBe(409)
        expect(res.body.message).toMatch(/already have an api key/i)
    })

    test("POST /apikeys fails if service doesn’t exist", async () => {
        const res = await request(app)
            .post(API)
            .send({ service: "noSuchService", key: "someKey" })
            .set("Authorization", `Bearer ${token}`)

        expect(res.statusCode).toBe(400)
        expect(res.body.message).toMatch(/must exist/i)
    })

    test("POST /apikeys with missing fields fails (Zod error)", async () => {
        const res = await request(app)
            .post(API)
            .send({ key: "missingService" }) // missing service
            .set("Authorization", `Bearer ${token}`)

        expect(res.statusCode).toBe(400)
        expect(res.body.message).toMatch(/must exist/i)
    })

    // --------------------------------------------------------
    // PUT /apikeys
    // --------------------------------------------------------
    test("PUT /apikeys updates API key successfully", async () => {
        // Create one to update
        await request(app)
            .post(API)
            .send({ service: "google_books", key: "oldKey" })
            .set("Authorization", `Bearer ${token}`)

        const res = await request(app)
            .put(API)
            .send({ service: "google_books", key: "newKeyValue" })
            .set("Authorization", `Bearer ${token}`)

        expect(res.statusCode).toBe(200)
        expect(res.body).toHaveProperty("service", "google_books")
    })

    test("PUT /apikeys fails if service doesn’t exist", async () => {
        const res = await request(app)
            .put(API)
            .send({ service: "noSuchService", key: "someKey" })
            .set("Authorization", `Bearer ${token}`)

        expect(res.statusCode).toBe(400)
        expect(res.body.message).toMatch(/must exist/i)
    })

    // --------------------------------------------------------
    // DELETE /apikeys
    // --------------------------------------------------------
    test("DELETE /apikeys deletes API key successfully", async () => {
        // Create one to delete
        await request(app)
            .post(API)
            .send({ service: "google_books", key: "123" })
            .set("Authorization", `Bearer ${token}`)

        const res = await request(app)
            .delete(API)
            .send({ service: "google_books" })
            .set("Authorization", `Bearer ${token}`)

        expect(res.statusCode).toBe(200)
        expect(res.body.message).toMatch(/deleted/i)
    })

    test("DELETE /apikeys fails for missing service field", async () => {
        const res = await request(app)
            .delete(API)
            .send({})
            .set("Authorization", `Bearer ${token}`)

        expect(res.statusCode).toBe(400)
        expect(res.body.message).toMatch(/Service must exist/i)
    })

    test("DELETE /apikeys fails if service doesn’t exist", async () => {
        const res = await request(app)
            .delete(API)
            .send({ service: "unknownService" })
            .set("Authorization", `Bearer ${token}`)

        expect(res.statusCode).toBe(400)
        expect(res.body.message).toMatch(/Service must exist/i)
    })
})
