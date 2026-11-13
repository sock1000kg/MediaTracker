import request from "supertest"
import app from "@/app.js"
import { getQueue } from "@/queue/index.js"
import { MemoryQueue } from "@/queue/memoryQueue.js"
import type { JobContext, JobName } from "@/queue/types.js"

const PW = "StrongPass1!"
const auth = (t: string) => ({ Authorization: `Bearer ${t}` })

async function registerAndLogin(username: string) {
    await request(app).post("/auth/register")
        .send({ username, password: PW, displayName: "Tester", registerKey: process.env.REGISTER_KEY })
        .set("Content-Type", "application/json")
    const res = await request(app).post("/auth/login").send({ username, password: PW })
    return { token: res.body.accessToken as string, userId: res.body.user.id as number }
}

const queue = () => getQueue() as MemoryQueue
const JOB = "test.echo" as unknown as JobName
const enqueue = (userId: number | null) =>
    queue().enqueue(JOB, { hello: "world" } as never, userId === null ? {} : { userId })

describe("GET /jobs/:id", () => {
    beforeAll(() => {
        queue().registerHandler(JOB as "demo.reset", (async (ctx: JobContext<"demo.reset">) => {
            await ctx.updateProgress(100)
            return { echoed: true }
        }) as never)
    })

    test("owner gets 200 with status and no userId", async () => {
        const a = await registerAndLogin("JobsOwnerA")
        const { id } = await enqueue(a.userId)
        await queue().drain()
        const res = await request(app).get(`/jobs/${id}`).set(auth(a.token))
        expect(res.statusCode).toBe(200)
        expect(res.body.id).toBe(id)
        expect(res.body.status).toBe("completed")
        expect(res.body.progress).toBe(100)
        expect(res.body.result).toEqual({ echoed: true })
        expect(res.body).not.toHaveProperty("userId")
        expect(JSON.stringify(res.body)).not.toMatch(/\n\s+at /)
    })

    test("another user gets 404", async () => {
        const a = await registerAndLogin("JobsOwnerB")
        const b = await registerAndLogin("JobsOtherB")
        const { id } = await enqueue(a.userId)
        await queue().drain()
        const res = await request(app).get(`/jobs/${id}`).set(auth(b.token))
        expect(res.statusCode).toBe(404)
        expect(res.body.message ?? res.body.error).toMatch(/Job not found/)
    })

    test("system job (userId null) is 404 even for a logged in user", async () => {
        const a = await registerAndLogin("JobsSysA")
        const { id } = await enqueue(null)
        await queue().drain()
        const res = await request(app).get(`/jobs/${id}`).set(auth(a.token))
        expect(res.statusCode).toBe(404)
    })

    test("random uuid and malformed ids are 404", async () => {
        const a = await registerAndLogin("JobsRandA")
        expect((await request(app).get("/jobs/3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6b").set(auth(a.token))).statusCode).toBe(404)
        expect((await request(app).get("/jobs/not-a-real-id").set(auth(a.token))).statusCode).toBe(404)
    })

    test("no token is 401", async () => {
        const res = await request(app).get("/jobs/whatever")
        expect(res.statusCode).toBe(401)
    })
})
