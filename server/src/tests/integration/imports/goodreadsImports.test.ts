import request from "supertest"
import app from "@/app.js"
import { prisma } from "@/tests/jest.setup.js"
import { findUserByUsername } from "@/repositories/authRepository.js"
import { AppError } from "@/api/domain/error.js"
import { demoService } from "@/services/demoService.js"
import { jest } from "@jest/globals"
import { getQueue, registerAllHandlers } from "@/queue/index.js"
import { MemoryQueue } from "@/queue/memoryQueue.js"
import { openLibraryService } from "@/services/search/openLibrarySearchService.js"

const API = "/imports/goodreads"
const queue = () => getQueue() as MemoryQueue

// Uploads a CSV, expects 202, waits for the worker and returns the finished job.
async function importAndWait(token: string, csv: string, filename = "export.csv") {
    const res = await request(app)
        .post(API)
        .set("Authorization", `Bearer ${token}`)
        .attach("file", Buffer.from(csv), filename)
    expect(res.statusCode).toBe(202)
    expect(typeof res.body.jobId).toBe("string")
    await queue().drain()
    const job = await request(app).get(`/jobs/${res.body.jobId}`).set("Authorization", `Bearer ${token}`)
    return { jobId: res.body.jobId as string, job: job.body, status: job.statusCode }
}

// create + login user: returns token + userId
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

describe("Media Import Routes (Goodreads)", () => {
    let token: string
    let userId: number
    let systemUserId: number

    beforeAll(async () => {
        registerAllHandlers()
        // No network: enrichment lookups find nothing
        jest.spyOn(openLibraryService, "searchBooksOpenLib").mockRejectedValue(new Error("offline"))
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
        jest.restoreAllMocks()
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
        
        const { job, status } = await importAndWait(token, csvContent, "goodreads_export.csv")
        expect(status).toBe(200)
        expect(job.status).toBe("completed")
        expect(job.progress).toBe(100)
        expect(job.result).toEqual(expect.objectContaining({
            imported: 2,
            skipped: 0,
            failures: []
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
        
        // First Run
        await importAndWait(token, csvContent, "dune.csv")

        // Second Run (Duplicate)
        const { job } = await importAndWait(token, csvContent, "dune.csv")

        expect(job.status).toBe("completed")
        expect(job.result).toEqual(expect.objectContaining({
            imported: 0,
            skipped: 1, // Should skip the duplicate
            failures: []
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

        const { job } = await importAndWait(token, csvContent, "bad.csv")
        expect(job.status).toBe("completed")
        const result = job.result

        // We expect 1 success and 1 failure
        expect(result.imported).toBe(1)

        // Check failures array
        expect(result.failures).toHaveLength(1)
        expect(result.failures[0]).toEqual(expect.objectContaining({
            row: 3, // Header (1) + Valid Row (1) + Malformed Row (1) = Line 3
            reason: expect.stringMatching(/Validation Error/i)
        }))
    })

    // --------------------------------------------------------
    // Cheap validation before enqueueing
    // --------------------------------------------------------
    const upload = (csv: Buffer | string, tk = token) =>
        request(app).post(API).set("Authorization", `Bearer ${tk}`).attach("file", Buffer.from(csv), "x.csv")

    test("rejects a garbage, non-CSV body with 400", async () => {
        const res = await upload('"unterminated,quote\nTitle,Author\n"a"b,c')
        expect(res.statusCode).toBe(400)
        expect(res.body.message).toMatch(/couldn't read that csv/i)
    })

    test("rejects a header-only file with 400 'no rows'", async () => {
        const res = await upload("Title,Author,Book Id\n")
        expect(res.statusCode).toBe(400)
        expect(res.body.message).toMatch(/no rows/i)
    })

    test("rejects a CSV without Title/Author columns with 400", async () => {
        const res = await upload("Name,Writer\nDune,Frank Herbert\n")
        expect(res.statusCode).toBe(400)
        expect(res.body.message).toMatch(/missing Title\/Author/i)
    })

    test("a second upload while one is queued/active gets 409 with that jobId", async () => {
        let release!: () => void
        const gateP = new Promise<void>((r) => { release = r })
        queue().registerHandler("import.goodreads", async () => { await gateP; return { imported: 0, skipped: 0, failures: [] } })
        try {
            const csv = "Title,Author,Book Id\nSomething,Someone,9001\n"
            const first = await upload(csv)
            expect(first.statusCode).toBe(202)
            const second = await upload(csv)
            expect(second.statusCode).toBe(409)
            expect(second.body.jobId).toBe(first.body.jobId)
            expect(second.body.message).toMatch(/already running/i)
        } finally {
            release()
            await queue().drain()
            registerAllHandlers()
        }
        // once finished, a new upload is accepted again
        const third = await upload("Title,Author,Book Id\nSomething,Someone,9001\n")
        expect(third.statusCode).toBe(202)
        await queue().drain()
    })

    test("the demo user is still blocked with 400 and nothing is enqueued", async () => {
        const spy = jest.spyOn(demoService, "ensureNotDemo").mockRejectedValueOnce(new AppError("Demo account cannot do this", 400))
        const before = (await queue().listJobs({ userId, limit: 20 })).length
        const res = await upload("Title,Author,Book Id\nA,B,1\n")
        expect(res.statusCode).toBe(400)
        expect(spy).toHaveBeenCalled()
        expect((await queue().listJobs({ userId, limit: 20 })).length).toBe(before)
    })

    test("the CSV payload is cleared from the queue after completion", async () => {
        const { jobId, job } = await importAndWait(token, "Title,Author,Book Id\nClear Me,Someone,9002\n")
        expect(job.status).toBe("completed")
        expect(queue().peekPayload(jobId)).toEqual({})
    })

    test("caps failures at 500 and reports failuresTruncated", async () => {
        const rows = Array.from({ length: 501 }, () => ",,0,0,,").join("\n")
        const { job } = await importAndWait(token, `Title,Author,My Rating,Year Published,Exclusive Shelf,Book Id\n${rows}\n`)
        expect(job.status).toBe("completed")
        expect(job.result.failures).toHaveLength(500)
        expect(job.result.failuresTruncated).toBe(1)
        expect(job.result.imported).toBe(0)
    })

    test("a small run reports failuresTruncated 0", async () => {
        const { job } = await importAndWait(token, "Title,Author,Book Id\n,,\nOk Book,Someone,9003\n")
        expect(job.result.failures).toHaveLength(1)
        expect(job.result.failuresTruncated).toBe(0)
    })

    // --------------------------------------------------------
    // GET /jobs?name=
    // --------------------------------------------------------
    test("GET /jobs?name=import.goodreads lists only the caller's import jobs, newest first", async () => {
        const other = await registerAndLogin("ImportOtherUser")
        await importAndWait(other.token, "Title,Author,Book Id\nOther Book,Other,9100\n")
        const first = await importAndWait(token, "Title,Author,Book Id\nL1,A,9101\n")
        const second = await importAndWait(token, "Title,Author,Book Id\nL2,A,9102\n")

        const res = await request(app).get("/jobs?name=import.goodreads&limit=2").set("Authorization", `Bearer ${token}`)
        expect(res.statusCode).toBe(200)
        expect(res.body).toHaveLength(2)
        expect(res.body[0].id).toBe(second.jobId)
        expect(res.body[1].id).toBe(first.jobId)
        for (const j of res.body) {
            expect(j.name).toBe("import.goodreads")
            expect(j).not.toHaveProperty("userId")
        }
        const otherRes = await request(app).get("/jobs?name=import.goodreads").set("Authorization", `Bearer ${other.token}`)
        expect(otherRes.body).toHaveLength(1)
    })

    test("GET /jobs with an empty limit defaults to 10 (not 1)", async () => {
        // earlier tests created well over 1 import job for this user
        const res = await request(app).get("/jobs?name=import.goodreads&limit=").set("Authorization", `Bearer ${token}`)
        expect(res.statusCode).toBe(200)
        expect(res.body.length).toBeGreaterThan(1)
        expect(res.body.length).toBeLessThanOrEqual(10)
        const junk = await request(app).get("/jobs?name=import.goodreads&limit=abc").set("Authorization", `Bearer ${token}`)
        expect(junk.body.length).toBeGreaterThan(1)
    })

    test("GET /jobs with an unknown name is 400", async () => {
        const res = await request(app).get("/jobs?name=nope").set("Authorization", `Bearer ${token}`)
        expect(res.statusCode).toBe(400)
    })
})
