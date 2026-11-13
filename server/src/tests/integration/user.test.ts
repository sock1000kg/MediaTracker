import request from "supertest"
import { parse } from "csv-parse/sync"
import app from "@/app.js"
import { prisma } from "@/tests/jest.setup.js"

const PW = "StrongPass1!"
const NEW_PW = "NewStrong2@pw"

async function registerAndLogin(username: string) {
    await request(app).post("/auth/register")
        .send({ username, password: PW, displayName: "Tester", registerKey: process.env.REGISTER_KEY })
        .set("Content-Type", "application/json")
    const res = await request(app).post("/auth/login").send({ username, password: PW })
    return { token: res.body.accessToken as string, userId: res.body.user.id as number, cookie: res.headers["set-cookie"] as unknown as string[] }
}

async function demoLogin() {
    const res = await request(app).post("/auth/login").send({ username: "demo", password: process.env.DEMO_USER_PASSWORD })
    return res.body.accessToken as string
}

const auth = (t: string) => ({ Authorization: `Bearer ${t}` })
const refreshWith = (cookie: string[]) => request(app).post("/auth/refresh").set("Cookie", cookie)

function hasKeyDeep(v: unknown, keys: string[]): boolean {
    if (Array.isArray(v)) return v.some((x) => hasKeyDeep(x, keys))
    if (v && typeof v === "object") {
        return Object.entries(v).some(([k, x]) => keys.includes(k) || hasKeyDeep(x, keys))
    }
    return false
}

describe("User settings routes", () => {
    test("GET /users/me has no password and empty preferences", async () => {
        const { token } = await registerAndLogin("UserMeA")
        const res = await request(app).get("/users/me").set(auth(token))
        expect(res.statusCode).toBe(200)
        expect(res.body.username).toBe("UserMeA")
        expect(res.body).not.toHaveProperty("password")
        expect(res.body.preferences).toEqual({})
    })

    test("PATCH /users/me updates displayName; invalid 400; demo 400", async () => {
        const { token } = await registerAndLogin("UserProfB")
        const ok = await request(app).patch("/users/me").set(auth(token)).send({ displayName: "New Name" })
        expect(ok.statusCode).toBe(200)
        expect(ok.body.displayName).toBe("New Name")
        expect(ok.body).not.toHaveProperty("password")

        const bad = await request(app).patch("/users/me").set(auth(token)).send({ displayName: "ab" })
        expect(bad.statusCode).toBe(400)

        const demo = await demoLogin()
        const d = await request(app).patch("/users/me").set(auth(demo)).send({ displayName: "Hacked name" })
        expect(d.statusCode).toBe(400)
    })

    test("password change", async () => {
        const { token, cookie } = await registerAndLogin("UserPwC")
        // second session
        const second = await request(app).post("/auth/login").send({ username: "UserPwC", password: PW })
        const otherCookie = second.headers["set-cookie"] as unknown as string[]

        const wrong = await request(app).put("/users/me/password").set(auth(token))
            .send({ currentPassword: "WrongPass1!", newPassword: NEW_PW })
        expect(wrong.statusCode).toBe(403)
        expect((await request(app).post("/auth/login").send({ username: "UserPwC", password: PW })).statusCode).toBe(200)

        const weak = await request(app).put("/users/me/password").set(auth(token))
            .send({ currentPassword: PW, newPassword: "weak" })
        expect(weak.statusCode).toBe(400)

        const same = await request(app).put("/users/me/password").set(auth(token))
            .send({ currentPassword: PW, newPassword: PW })
        expect(same.statusCode).toBe(400)

        const ok = await request(app).put("/users/me/password").set(auth(token))
            .send({ currentPassword: PW, newPassword: NEW_PW })
        expect(ok.statusCode).toBe(200)
        expect(ok.body.accessToken).toBeTruthy()
        const newCookie = ok.headers["set-cookie"] as unknown as string[]
        expect(newCookie.join(";")).toMatch(/refreshToken=/)

        expect((await request(app).post("/auth/login").send({ username: "UserPwC", password: NEW_PW })).statusCode).toBe(200)
        expect((await request(app).post("/auth/login").send({ username: "UserPwC", password: PW })).statusCode).toBe(401)
        expect((await refreshWith(cookie)).statusCode).toBe(401)
        expect((await refreshWith(otherCookie)).statusCode).toBe(401)
        expect((await refreshWith(newCookie)).statusCode).toBe(200)

        const demo = await demoLogin()
        const d = await request(app).put("/users/me/password").set(auth(demo))
            .send({ currentPassword: process.env.DEMO_USER_PASSWORD, newPassword: NEW_PW })
        expect(d.statusCode).toBe(400)
    })

    test("preferences patch/merge/null/validation (also demo)", async () => {
        const { token } = await registerAndLogin("UserPrefD")
        await request(app).patch("/users/me/preferences").set(auth(token)).send({ theme: "dark" })
        const r2 = await request(app).patch("/users/me/preferences").set(auth(token)).send({ hideLogged: { books: true } })
        expect(r2.statusCode).toBe(200)
        const got = await request(app).get("/users/me/preferences").set(auth(token))
        expect(got.body).toEqual({ theme: "dark", hideLogged: { books: true } })

        const bad = await request(app).patch("/users/me/preferences").set(auth(token)).send({ theme: "purple" })
        expect(bad.statusCode).toBe(400)
        const unk = await request(app).patch("/users/me/preferences").set(auth(token)).send({ nope: 1 })
        expect(unk.statusCode).toBe(400)
        const big = await request(app).patch("/users/me/preferences").set(auth(token)).send({ theme: "dark", pad: "x".repeat(5000) })
        expect([400, 413]).toContain(big.statusCode)
        expect((await request(app).get("/users/me/preferences").set(auth(token))).body)
            .toEqual({ theme: "dark", hideLogged: { books: true } })

        const del = await request(app).patch("/users/me/preferences").set(auth(token)).send({ theme: null })
        expect(del.body).toEqual({ hideLogged: { books: true } })

        const demo = await demoLogin()
        const d = await request(app).patch("/users/me/preferences").set(auth(demo)).send({ defaultTab: "logs" })
        expect(d.statusCode).toBe(200)
        await request(app).patch("/users/me/preferences").set(auth(demo)).send({ defaultTab: null })
    })

    test("export JSON and CSV", async () => {
        const { token } = await registerAndLogin("UserExpE")
        const me = await prisma.user.findUniqueOrThrow({ where: { username: "UserExpE" } })
        const type = await prisma.mediaType.findFirst({ where: { name: "book" } })
        for (const [title, notes] of [["=HYPERLINK(\"http://x\",\"y\")", "line1, with comma\nline2"], ["Plain Title", "ok"]]) {
            const m = await prisma.media.create({ data: { title, creator: "Someone", userId: me.id, mediaTypeId: type?.id ?? null, source: "custom" } })
            await prisma.userLogs.create({ data: { userId: me.id, mediaId: m.id, status: "completed", rating: 80, notes } })
        }
        const logCount = await prisma.userLogs.count({ where: { userId: me.id } })

        const j = await request(app).get("/users/me/export").set(auth(token))
        expect(j.statusCode).toBe(200)
        expect(j.headers["content-type"]).toMatch(/application\/json; charset=utf-8/)
        expect(j.headers["content-disposition"]).toMatch(/^attachment; filename="media-tracker-UserExpE-\d{4}-\d{2}-\d{2}\.json"; filename\*=UTF-8''/)
        const data = JSON.parse(j.text)
        expect(data.version).toBe(1)
        expect(data.logs).toHaveLength(logCount)
        expect(data.logs[0].media).toHaveProperty("title")
        expect(hasKeyDeep(data, ["id", "userId", "password", "key"])).toBe(false)

        const c = await request(app).get("/users/me/export?format=csv").set(auth(token)).buffer(true)
        expect(c.statusCode).toBe(200)
        expect(c.headers["content-type"]).toMatch(/text\/csv; charset=utf-8/)
        expect(c.headers["content-disposition"]).toMatch(/\.csv"; filename\*=UTF-8''/)
        const rows = parse(c.text.replace(/^\uFEFF/, ""), { columns: true }) as Record<string, string>[]
        expect(Object.keys(rows[0])).toEqual(["title", "creator", "year", "type", "source", "source_id", "status", "rating", "notes", "logged_at", "categories", "url"])
        expect(rows).toHaveLength(logCount)
        expect(rows.some((r) => r.title.startsWith("'=HYPERLINK"))).toBe(true)
        expect(rows.some((r) => r.notes === "line1, with comma\nline2")).toBe(true)

        const bad = await request(app).get("/users/me/export?format=xml").set(auth(token))
        expect(bad.statusCode).toBe(400)
    })

    test("export works for a non-ASCII username containing a quote", async () => {
        const name = 'Đạt"Exp'
        const { token } = await registerAndLogin(name)
        expect(token).toBeTruthy()
        for (const fmt of ["json", "csv"]) {
            const res = await request(app).get(`/users/me/export?format=${fmt}`).set(auth(token))
            expect(res.statusCode).toBe(200)
            expect(res.headers["content-disposition"]).toMatch(
                /^attachment; filename="media-tracker-[A-Za-z0-9._-]+-\d{4}-\d{2}-\d{2}\.(json|csv)"/)
        }
    })

    test("delete account", async () => {
        const { token, userId } = await registerAndLogin("UserDelF")
        const me = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
        await prisma.userAPIKey.create({ data: { userId, service: "google_books", key: "enc" } })
        const type = await prisma.mediaType.create({ data: { name: "mytype", userId } })
        const mine = await prisma.media.create({ data: { title: "Mine", userId, mediaTypeId: type.id, source: "custom" } })
        await prisma.userLogs.create({ data: { userId, mediaId: mine.id } })
        const sys = await prisma.user.findUniqueOrThrow({ where: { username: "system" } })
        const shared = await prisma.media.create({ data: { title: "Shared for delete test", userId: sys.id, source: "custom" } })
        await prisma.userLogs.create({ data: { userId, mediaId: shared.id } })

        const wrong = await request(app).delete("/users/me").set(auth(token)).send({ password: "WrongPass1!", confirmUsername: me.username })
        expect(wrong.statusCode).toBe(403)
        const mism = await request(app).delete("/users/me").set(auth(token)).send({ password: PW, confirmUsername: "userdelf" })
        expect(mism.statusCode).toBe(400)

        const demo = await demoLogin()
        const d = await request(app).delete("/users/me").set(auth(demo)).send({ password: process.env.DEMO_USER_PASSWORD, confirmUsername: "demo" })
        expect(d.statusCode).toBe(400)

        const ok = await request(app).delete("/users/me").set(auth(token)).send({ password: PW, confirmUsername: me.username })
        expect(ok.statusCode).toBe(204)

        expect(await prisma.user.findUnique({ where: { id: userId } })).toBeNull()
        expect(await prisma.userLogs.count({ where: { userId } })).toBe(0)
        expect(await prisma.media.count({ where: { userId } })).toBe(0)
        expect(await prisma.mediaType.count({ where: { userId } })).toBe(0)
        expect(await prisma.userAPIKey.count({ where: { userId } })).toBe(0)
        expect(await prisma.refreshToken.count({ where: { userId } })).toBe(0)
        expect(await prisma.media.findUnique({ where: { id: shared.id } })).not.toBeNull()
        expect((await request(app).post("/auth/login").send({ username: "UserDelF", password: PW })).statusCode).toBe(404)

        await prisma.media.delete({ where: { id: shared.id } })
    })
})
