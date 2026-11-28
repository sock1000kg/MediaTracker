import request from 'supertest'
import app from '@/app.js'
import { prisma } from '@/tests/jest.setup.js'
import { LIMITS } from '@/config/limits.js'
import { mergeMediaInto } from '@/services/mediaMergeService.js'

const registerKey = process.env.REGISTER_KEY
const password = 'StrongPass1!'
const DAY = 24 * 60 * 60 * 1000
const dayFromNow = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10)
const SECRET = 'the-secret-words-in-the-envelope'

type User = { token: string; userId: string }

async function newUser(username: string): Promise<User> {
    await prisma.user.deleteMany({ where: { username } })
    const reg = await request(app).post('/auth/register').send({ username, password, displayName: username, registerKey })
    expect(reg.statusCode).toBe(201)
    const login = await request(app).post('/auth/login').send({ username, password })
    const user = await prisma.user.findUniqueOrThrow({ where: { username } })
    return { token: login.body.accessToken as string, userId: user.id }
}

describe('Sealed letters', () => {
    let b: User
    let bookTypeId: string
    let systemUserId: string
    let n = 0

    const auth = (u: User) => ({ Authorization: `Bearer ${u.token}` })
    const newMedia = () => prisma.media.create({
        data: { title: `Letter Book ${++n}`, userId: systemUserId, provider: 'openlibrary', providerId: `/works/OLLETTER${n}-${Date.now()}`, mediaTypeId: bookTypeId },
    })
    const newLog = async (u: User, mediaId?: string) => {
        const res = await request(app).post('/logs').set(auth(u)).send({ mediaId: mediaId ?? (await newMedia()).id })
        expect(res.statusCode).toBe(201)
        return res.body as { id: string; media: { id: string; title: string } }
    }
    const seal = (u: User, logId: string, extra: object = { opensAt: dayFromNow(30) }) =>
        request(app).post('/letters').set(auth(u)).send({ logId, body: SECRET, ...extra })
    const open = (u: User, id: string) => request(app).post(`/letters/${id}/open`).set(auth(u))
    const list = async (u: User) => (await request(app).get('/letters').set(auth(u))).body as { id: string; state: string; body?: string; openedAt: string | null }[]
    const logCounts = async (u: User, logId: string) =>
        (await request(app).get('/logs').set(auth(u))).body.find((l: { id: string }) => l.id === logId).letters
    const makeDue = (id: string) => prisma.sealedLetter.update({ where: { id }, data: { opensAt: new Date(Date.now() - DAY) } })
    // Each test that counts letters gets its own account
    const fresh = () => newUser(`Letters${++n}`)

    beforeAll(async () => {
        b = await newUser('LettersOther')
        bookTypeId = (await prisma.mediaType.findFirstOrThrow({ where: { name: 'book' } })).id
        systemUserId = (await prisma.user.findFirstOrThrow({ where: { username: 'system' } })).id
    })

    it('seals a date letter and a relog letter without ever sending the text back', async () => {
        const a = await fresh()
        const log = await newLog(a)

        const dated = await seal(a, log.id, { opensAt: dayFromNow(10) })
        expect(dated.statusCode).toBe(201)
        expect(dated.body).toMatchObject({
            logId: log.id, state: 'sealed', opensOnRelog: false, openedAt: null,
            media: { id: log.media.id, title: log.media.title, mediaType: 'book' },
        })
        expect(dated.body.opensAt.slice(0, 10)).toBe(dayFromNow(10))

        const relog = await seal(a, log.id, { opensOnRelog: true })
        expect(relog.statusCode).toBe(201)
        expect(relog.body).toMatchObject({ state: 'sealed', opensOnRelog: true, opensAt: null })

        const all = await list(a)
        expect(all.map(l => l.id)).toEqual([relog.body.id, dated.body.id]) // newest first
        expect(JSON.stringify([dated.body, relog.body, all])).not.toContain(SECRET)

        const refused = await open(a, dated.body.id)
        expect(refused.statusCode).toBe(409)
        expect(JSON.stringify(refused.body)).not.toContain(SECRET)
        expect((await open(a, relog.body.id)).statusCode).toBe(409)
        expect(await logCounts(a, log.id)).toEqual({ sealed: 2, ready: 0 })
        const shelf = (await request(app).post('/collections').set(auth(a)).send({ name: 'Letters shelf' })).body
        await request(app).post(`/collections/${shelf.id}/items`).set(auth(a)).send({ logId: log.id })
        const collection = (await request(app).get(`/collections/${shelf.id}`).set(auth(a))).body
        expect(collection.items[0].log.letters).toEqual({ sealed: 2, ready: 0 })
    })

    it('rejects bad conditions, dates and text', async () => {
        const a = await fresh()
        const log = await newLog(a)
        const far = new Date()
        far.setUTCFullYear(far.getUTCFullYear() + 26)

        const bad: object[] = [
            { opensAt: dayFromNow(5), opensOnRelog: true },
            {},
            { opensOnRelog: false },
            { opensAt: dayFromNow(-1) },
            { opensAt: dayFromNow(0) },
            { opensAt: far.toISOString().slice(0, 10) },
            { opensAt: 'soon' },
            { opensOnRelog: true, body: '   ' },
            { opensOnRelog: true, body: 'x'.repeat(LIMITS.letters.bodyMaxLength + 1) },
        ]
        for (const extra of bad) {
            expect([extra, (await seal(a, log.id, extra)).statusCode]).toEqual([extra, 400])
        }
        expect(await prisma.sealedLetter.count({ where: { userId: a.userId } })).toBe(0)
        expect((await seal(a, log.id, { opensOnRelog: true, body: 'x'.repeat(LIMITS.letters.bodyMaxLength) })).statusCode).toBe(201)
    })

    it("judges 'tomorrow' by the writer's date when one is possible", async () => {
        const a = await fresh()
        const log = await newLog(a)
        // A writer a day behind the server: the server's today is their tomorrow
        expect((await seal(a, log.id, { opensAt: dayFromNow(0), today: dayFromNow(-1) })).statusCode).toBe(201)
        // An impossible "today" is ignored
        expect((await seal(a, log.id, { opensAt: dayFromNow(0), today: dayFromNow(-30) })).statusCode).toBe(400)
    })

    it("someone else's log is a 404, and so is someone else's letter", async () => {
        const a = await fresh()
        const log = await newLog(a)
        expect((await seal(b, log.id)).statusCode).toBe(404)

        const id = (await seal(a, log.id)).body.id
        await makeDue(id)
        expect(await list(b)).toEqual([])
        expect((await open(b, id)).statusCode).toBe(404)
        expect((await request(app).delete(`/letters/${id}`).set(auth(b))).statusCode).toBe(404)
        expect(await prisma.sealedLetter.count({ where: { id, openedAt: null } })).toBe(1)
        expect((await request(app).get('/letters')).statusCode).toBe(401)
    })

    it('caps sealed letters per log; an opened one makes room', async () => {
        const a = await fresh()
        const log = await newLog(a)
        const ids: string[] = []
        for (let i = 0; i < LIMITS.letters.maxSealedPerLog; i++) ids.push((await seal(a, log.id)).body.id)
        expect((await seal(a, log.id)).statusCode).toBe(400)
        await makeDue(ids[0])
        expect((await open(a, ids[0])).statusCode).toBe(200)
        expect((await seal(a, log.id)).statusCode).toBe(201)
    })

    it('a date letter is ready once its date has passed, opens once and stays readable', async () => {
        const a = await fresh()
        const log = await newLog(a)
        const id = (await seal(a, log.id)).body.id
        await makeDue(id)

        const [ready] = await list(a)
        expect(ready.state).toBe('ready')
        expect(ready.body).toBeUndefined()
        expect(await logCounts(a, log.id)).toEqual({ sealed: 0, ready: 1 })

        const first = await open(a, id)
        expect(first.statusCode).toBe(200)
        expect(first.body).toMatchObject({ state: 'opened', body: SECRET })
        expect(first.body.openedAt).not.toBeNull()

        const again = await open(a, id)
        expect(again.statusCode).toBe(200)
        expect(again.body.openedAt).toBe(first.body.openedAt)
        expect((await list(a))[0].body).toBe(SECRET)
        expect(await logCounts(a, log.id)).toEqual({ sealed: 0, ready: 0 })
    })

    it('a relog letter is ready only after an entry added once it was sealed', async () => {
        const a = await fresh()
        const log = await newLog(a)
        const addEntry = (body: object) => request(app).post(`/logs/${log.id}/entries`).set(auth(a)).send(body)

        expect((await addEntry({ finishedAt: '2026-01-01' })).statusCode).toBe(201)
        const id = (await seal(a, log.id, { opensOnRelog: true })).body.id
        expect((await list(a))[0].state).toBe('sealed')
        expect((await open(a, id)).statusCode).toBe(409)

        const saved = await addEntry({ finishedAt: '2026-02-02' })
        expect(saved.body.letters).toEqual({ sealed: 0, ready: 1 })
        expect((await list(a))[0].state).toBe('ready')
        expect((await open(a, id)).body.body).toBe(SECRET)
    })

    it('summarises sealed and ready letters with the next opening date', async () => {
        const a = await fresh()
        const log = await newLog(a)
        const summary = async () => (await request(app).get('/letters/summary').set(auth(a))).body
        expect(await summary()).toEqual({ sealed: 0, ready: 0, nextOpensAt: null })

        await seal(a, log.id, { opensOnRelog: true })
        expect(await summary()).toEqual({ sealed: 1, ready: 0, nextOpensAt: null })

        await seal(a, log.id, { opensAt: dayFromNow(90) })
        await seal(a, log.id, { opensAt: dayFromNow(20) })
        await makeDue((await seal(a, log.id)).body.id)

        const s = await summary()
        expect(s).toMatchObject({ sealed: 3, ready: 1 })
        expect(s.nextOpensAt.slice(0, 10)).toBe(dayFromNow(20))
    })

    it('tears up a letter, and deleting a log takes its letters', async () => {
        const a = await fresh()
        const log = await newLog(a)
        const id = (await seal(a, log.id)).body.id
        expect((await request(app).delete(`/letters/${id}`).set(auth(a))).statusCode).toBe(204)
        expect(await list(a)).toEqual([])

        await seal(a, log.id)
        const gone = await request(app).delete(`/logs/${log.id}`).set(auth(a)).send({ confirm: true })
        expect(gone.statusCode).toBe(200)
        expect(await prisma.sealedLetter.count({ where: { userId: a.userId } })).toBe(0)
    })

    it('keeps letters when two copies of an item are merged', async () => {
        const a = await fresh()
        const from = await newMedia()
        const into = await newMedia()
        const fromLog = await newLog(a, from.id)
        const intoLog = await newLog(a, into.id)
        const id = (await seal(a, fromLog.id)).body.id

        await prisma.$transaction(async (tx) => mergeMediaInto(from.id, into.id, tx))

        expect(await prisma.sealedLetter.findUnique({ where: { id } })).toMatchObject({ logId: intoLog.id })
    })

    it('exports opened letters with their text and sealed ones without it', async () => {
        const a = await fresh()
        const log = await newLog(a)
        const opened = (await request(app).post('/letters').set(auth(a)).send({ logId: log.id, body: 'already read', opensAt: dayFromNow(5) })).body.id
        await makeDue(opened)
        await open(a, opened)
        await seal(a, log.id, { opensOnRelog: true })
        const ready = (await seal(a, log.id)).body.id
        await makeDue(ready)

        const json = await request(app).get('/users/me/export').set(auth(a))
        expect(json.statusCode).toBe(200)
        expect(json.text).not.toContain(SECRET)
        const letters = JSON.parse(json.text).logs.find((l: { media: { title: string } }) => l.media.title === log.media.title).letters
        expect(letters).toHaveLength(3)
        expect(letters[0]).toMatchObject({ body: 'already read', opensOnRelog: false })
        expect(letters[1]).toMatchObject({ opensOnRelog: true, opensAt: null, openedAt: null })
        expect(letters[2].opensAt).not.toBeNull()

        const csv = await request(app).get('/users/me/export?format=csv').set(auth(a))
        expect(csv.text).not.toContain(SECRET)
    })
})
