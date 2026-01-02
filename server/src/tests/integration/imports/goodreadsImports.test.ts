import request from "supertest"
import app from "@/app.js"
import { prisma } from "@/tests/jest.setup.js"
import { findUserByUsername } from "@/repositories/authRepository.js"
import { AppError } from "@/api/domain/error.js"

const API = "/api/imports/goodreads"

// create + login user: returns token + userId
async function registerAndLogin(username: string) {
    await request(app)
        .post("/api/auth/register")
        .send({ username, password: "StrongPass1!", displayName: "Tester", registerKey: process.env.REGISTER_KEY })
        .set("Content-Type", "application/json")

    const loginRes = await request(app)
        .post("/api/auth/login")
        .send({ username, password: "StrongPass1!" })
        .set("Content-Type", "application/json")

    return {
        token: loginRes.body.accessToken,
        userId: loginRes.body.user.id,
    }
}

describe("Media Import Routes (Goodreads)", () => {
    let token: string
    let userId: number
    let systemUserId: number

    beforeAll(async () => {
        // Setup specific prerequisites for Import Service
        // Ensure System user exists (Case sensitive: matches your service code "System")
        const sysUser = await findUserByUsername("system", prisma)
        if (!sysUser) throw new AppError("System user missing", 500)
        systemUserId = sysUser.id

        // Register the Test User
        const result = await registerAndLogin("ImportUser")
        token = result.token
        userId = result.userId
    })

    afterAll(async () => {
        // Cleanup
        await prisma.userLogs.deleteMany({ where: { userId } })
        await prisma.media.deleteMany({ where: { userId: systemUserId } })
    })

    // --------------------------------------------------------
    // POST /import-goodreads
    // --------------------------------------------------------
    test("POST /import-goodreads successfully imports valid CSV", async () => {
        const csvContent = 
`Title,Author,My Rating,Year Published,Exclusive Shelf,Book Id
The Great Gatsby,F. Scott Fitzgerald,5,1925,read,4671
The Hobbit,J.R.R. Tolkien,4,1937,currently-reading,5907`
        
        const res = await request(app)
            .post(API)
            .set("Authorization", `Bearer ${token}`)
            .attach('file', Buffer.from(csvContent), 'goodreads_export.csv') // Attach acts as file upload

        expect(res.statusCode).toBe(200)
        expect(res.body).toEqual(expect.objectContaining({
            imported: 2,
            skipped: 0,
            errors: 0
        }))

        // Verify Data in DB
        const logs = await prisma.userLogs.findMany({ where: { userId } })
        expect(logs).toHaveLength(3) // +1 cus of default log
        
        // Check "The Great Gatsby" Log
        const gatsbyLog = logs.find(l => l.rating === 100) // 5 stars * 20
        expect(gatsbyLog).toBeDefined()
        expect(gatsbyLog?.status).toBe("completed") // mapped from 'read'
    })

    test("POST /import-goodreads skips duplicates if run twice", async () => {
        const csvContent = 
`Title,Author,My Rating,Year Published,Exclusive Shelf,Book Id
Dune,Frank Herbert,5,1965,read,234225`
        
        const buffer = Buffer.from(csvContent)

        // First Run
        await request(app)
            .post(API)
            .set("Authorization", `Bearer ${token}`)
            .attach('file', buffer, 'dune.csv')

        // Second Run (Duplicate)
        const res = await request(app)
            .post(API)
            .set("Authorization", `Bearer ${token}`)
            .attach('file', buffer, 'dune.csv')

        expect(res.statusCode).toBe(200)
        expect(res.body).toEqual(expect.objectContaining({
            imported: 0,
            skipped: 1 // Should skip the duplicate
        }))
    })

    test("POST /import-goodreads fails 400 if no file attached", async () => {
        const res = await request(app)
            .post(API)
            .set("Authorization", `Bearer ${token}`)
            // No .attach()

        expect(res.statusCode).toBe(400)
        expect(res.body.message).toMatch(/no csv file/i)
    })

    test("POST /import-goodreads returns error counts for malformed rows", async () => {
        // Row 2 is missing Title/Author which violates schema
        const csvContent = 
`Title,Author,My Rating,Year Published,Exclusive Shelf,Book Id
Valid Book,Valid Author,5,2020,read,111
,,0,0,,` 

        const res = await request(app)
            .post(API)
            .set("Authorization", `Bearer ${token}`)
            .attach('file', Buffer.from(csvContent), 'bad.csv')

        expect(res.statusCode).toBe(200)
        // Validation strategy:
        // Validate per row -> returns errors count instead of crashing
        expect(res.body.errors).toBeGreaterThan(0) 
        expect(res.body.imported).toBe(1)
    })
})