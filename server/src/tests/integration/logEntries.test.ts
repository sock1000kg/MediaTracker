import request from 'supertest'
import app from '@/app.js'
import { prisma } from '@/tests/jest.setup.js'
import { LIMITS } from '@/config/limits.js'

const registerKey = process.env.REGISTER_KEY
const password = 'StrongPass1!'
const day = (d: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : null)
const todayKey = () => new Date().toISOString().slice(0, 10)

async function newUser(username: string) {
    await prisma.user.deleteMany({ where: { username } })
    const reg = await request(app).post('/auth/register').send({ username, password, displayName: username, registerKey })
    expect(reg.statusCode).toBe(201)
    const login = await request(app).post('/auth/login').send({ username, password })
    const user = await prisma.user.findUniqueOrThrow({ where: { username } })
    return { token: login.body.accessToken as string, userId: user.id }
}

describe('Log entries: one log per item, many dated entries', () => {
    let a: { token: string; userId: string }
    let b: { token: string; userId: string }
    let bookTypeId: string
    let systemUserId: string
    let n = 0

    const authA = () => ({ Authorization: `Bearer ${a.token}` })
    const authB = () => ({ Authorization: `Bearer ${b.token}` })
    const newMedia = async (title = `Entry Book ${++n}`) => prisma.media.create({
        data: { title, creator: 'Someone', userId: systemUserId, provider: 'openlibrary', providerId: `/works/OLENTRY${n}${Date.now()}`, mediaTypeId: bookTypeId },
    })
    const newLog = async (mediaId: string, body: object = {}) => {
        const res = await request(app).post('/logs').set(authA()).send({ mediaId, ...body })
        expect(res.statusCode).toBe(201)
        return res.body
    }

    beforeAll(async () => {
        a = await newUser('EntriesUserA')
        b = await newUser('EntriesUserB')
        bookTypeId = (await prisma.mediaType.findFirstOrThrow({ where: { name: 'book' } })).id
        systemUserId = (await prisma.user.findFirstOrThrow({ where: { username: 'system' } })).id
    })

    describe('entry routes', () => {
        it('creates, edits and deletes an entry; the log keeps its single row', async () => {
            const media = await newMedia()
            const log = await newLog(media.id, { status: 'wishlist' })
            expect(log.entries).toEqual([])
            expect(log.entryCount).toBe(0)

            const created = await request(app).post(`/logs/${log.id}/entries`).set(authA()).send({
                startedAt: '2026-01-02', finishedAt: '2026-01-20', note: 'first read',
                progressChapters: 12, edition: { title: "L'étranger", format: 'Paperback', language: 'French' },
            })
            expect(created.statusCode).toBe(201)
            expect(created.body.entryCount).toBe(1)
            const entry = created.body.entries[0]
            expect(day(entry.startedAt)).toBe('2026-01-02')
            expect(day(entry.finishedAt)).toBe('2026-01-20')
            expect(entry).toMatchObject({ note: 'first read', progressChapters: 12, edition: { title: "L'étranger", format: 'Paperback', language: 'French' } })

            const edited = await request(app).put(`/logs/${log.id}/entries/${entry.id}`).set(authA())
                .send({ note: 'changed', finishedAt: '2026-01-25', edition: { format: 'Kindle' } })
            expect(edited.statusCode).toBe(200)
            expect(edited.body.entries[0]).toMatchObject({ note: 'changed', edition: { format: 'Kindle' } })
            expect(day(edited.body.entries[0].finishedAt)).toBe('2026-01-25')
            expect(day(edited.body.entries[0].startedAt)).toBe('2026-01-02') // untouched

            const cleared = await request(app).put(`/logs/${log.id}/entries/${entry.id}`).set(authA()).send({ edition: null, note: null })
            expect(cleared.body.entries[0]).toMatchObject({ edition: null, note: null })

            const deleted = await request(app).delete(`/logs/${log.id}/entries/${entry.id}`).set(authA())
            expect(deleted.statusCode).toBe(200)
            expect(deleted.body.entries).toEqual([])
            expect(await prisma.userLogs.count({ where: { id: log.id } })).toBe(1)
        })

        it("another user's log is a 404 for every entry route", async () => {
            const media = await newMedia()
            const log = await newLog(media.id)
            const entry = (await request(app).post(`/logs/${log.id}/entries`).set(authA()).send({ finishedAt: '2026-02-02' })).body.entries[0]

            expect((await request(app).post(`/logs/${log.id}/entries`).set(authB()).send({})).statusCode).toBe(404)
            expect((await request(app).put(`/logs/${log.id}/entries/${entry.id}`).set(authB()).send({ note: 'x' })).statusCode).toBe(404)
            expect((await request(app).delete(`/logs/${log.id}/entries/${entry.id}`).set(authB())).statusCode).toBe(404)
            expect(await prisma.logEntry.count({ where: { logId: log.id } })).toBe(1)
        })

        it('rejects a finish before the start, a bad edition key and an over-long note with 400', async () => {
            const media = await newMedia()
            const log = await newLog(media.id)

            const backwards = await request(app).post(`/logs/${log.id}/entries`).set(authA()).send({ startedAt: '2026-05-10', finishedAt: '2026-05-01' })
            expect(backwards.statusCode).toBe(400)
            expect(backwards.body.message).toBe("Finished date can't be before the start date")

            expect((await request(app).post(`/logs/${log.id}/entries`).set(authA()).send({ edition: { isbn: '123' } })).statusCode).toBe(400)
            expect((await request(app).post(`/logs/${log.id}/entries`).set(authA()).send({ note: 'x'.repeat(LIMITS.logs.entryNoteMaxLength + 1) })).statusCode).toBe(400)

            // editing so the finish lands before the stored start is checked against the entry as it is
            const entry = (await request(app).post(`/logs/${log.id}/entries`).set(authA()).send({ startedAt: '2026-05-10' })).body.entries[0]
            const bad = await request(app).put(`/logs/${log.id}/entries/${entry.id}`).set(authA()).send({ finishedAt: '2026-05-01' })
            expect(bad.statusCode).toBe(400)
            expect(bad.body.message).toBe("Finished date can't be before the start date")
        })

        it('refuses the 101st entry', async () => {
            const media = await newMedia()
            const log = await newLog(media.id)
            await prisma.logEntry.createMany({
                data: Array.from({ length: LIMITS.logs.maxEntriesPerLog }, (_, i) => ({ logId: log.id, finishedAt: new Date(Date.UTC(2000, 0, 1 + i)) })),
            })
            const res = await request(app).post(`/logs/${log.id}/entries`).set(authA()).send({ finishedAt: '2026-01-01' })
            expect(res.statusCode).toBe(400)
            expect(await prisma.logEntry.count({ where: { logId: log.id } })).toBe(LIMITS.logs.maxEntriesPerLog)
        })
    })

    describe('PUT /logs/:id', () => {
        it('answers 400 "Dates belong to an entry" when the body carries dates or progress', async () => {
            const media = await newMedia()
            const log = await newLog(media.id)
            for (const body of [{ startedAt: '2026-05-01' }, { finishedAt: null }, { started_at: '2026-05-01' }, { progressEpisodes: 3 }, { progress: { watchedEpisodes: 3 } }]) {
                const res = await request(app).put(`/logs/${log.id}`).set(authA()).send(body)
                expect(res.statusCode).toBe(400)
                expect(res.body.message).toBe('Dates belong to an entry')
            }
        })

        it('GET /logs no longer carries the old top-level date and progress fields', async () => {
            const media = await newMedia()
            const log = await newLog(media.id, { entry: { startedAt: '2026-03-01', progressEpisodes: 2 } })
            const found = (await request(app).get('/logs').set(authA())).body.find((l: { id: string }) => l.id === log.id)
            for (const gone of ['started_at', 'finished_at', 'progressEpisodes', 'progressChapters', 'progressVolumes', 'progress']) {
                expect(found).not.toHaveProperty(gone)
            }
            expect(found.entryCount).toBe(1)
            expect(found.entries[0].progressEpisodes).toBe(2)
        })
    })

    describe('status rules', () => {
        it('in progress with no open entry starts one dated today; with an open entry it adds nothing', async () => {
            const media = await newMedia()
            const log = await newLog(media.id, { status: 'wishlist' })

            const started = await request(app).put(`/logs/${log.id}`).set(authA()).send({ status: 'in progress' })
            expect(started.body.entryCount).toBe(1)
            expect(day(started.body.entries[0].startedAt)).toBe(todayKey())
            expect(started.body.entries[0].finishedAt).toBeNull()

            // dropped never closes or opens anything; back to in progress finds the open entry
            await request(app).put(`/logs/${log.id}`).set(authA()).send({ status: 'dropped' })
            const again = await request(app).put(`/logs/${log.id}`).set(authA()).send({ status: 'in progress' })
            expect(again.body.entryCount).toBe(1)
        })

        it('completed closes the open entry today, unless it started later', async () => {
            const media = await newMedia()
            const log = await newLog(media.id, { status: 'in progress' }) // no entry given: one is started today
            expect(log.entryCount).toBe(1)
            const done = await request(app).put(`/logs/${log.id}`).set(authA()).send({ status: 'completed' })
            expect(day(done.body.entries[0].finishedAt)).toBe(todayKey())

            const media2 = await newMedia()
            const future = await newLog(media2.id, { status: 'in progress', entry: { startedAt: day(new Date(Date.now() + 24 * 3600 * 1000))! } })
            const doneFuture = await request(app).put(`/logs/${future.id}`).set(authA()).send({ status: 'completed' })
            expect(doneFuture.body.entries[0].finishedAt).toBeNull()
        })

        it('completed with no entry leaves it without entries; wishlist never creates one', async () => {
            const media = await newMedia()
            const log = await newLog(media.id, { status: 'wishlist' })
            expect(log.entryCount).toBe(0)
            const done = await request(app).put(`/logs/${log.id}`).set(authA()).send({ status: 'completed' })
            expect(done.body.entryCount).toBe(0)
        })

        it('"Add entry" with nothing said starts one today and sets in progress; with both dates it completes', async () => {
            const media = await newMedia()
            const log = await newLog(media.id, { status: 'completed', entry: { startedAt: '2025-01-01', finishedAt: '2025-01-05' } })

            const added = await request(app).post(`/logs/${log.id}/entries`).set(authA()).send({})
            expect(added.statusCode).toBe(201)
            expect(added.body.status).toBe('in progress')
            expect(added.body.entryCount).toBe(2)
            expect(day(added.body.entries[0].startedAt)).toBe(todayKey()) // newest first

            const past = await request(app).post(`/logs/${log.id}/entries`).set(authA()).send({ startedAt: '2024-01-01', finishedAt: '2024-02-01' })
            expect(past.body.status).toBe('completed')
            expect(past.body.entryCount).toBe(3)
        })
    })

    describe('display title', () => {
        it("the log's own title wins, then the newest entry's edition title, then the media title", async () => {
            const media = await newMedia("L'Etranger (work)")
            const log = await newLog(media.id)
            const show = async () => (await request(app).get('/logs').set(authA())).body.find((l: { id: string }) => l.id === log.id).displayTitle

            expect(await show()).toBe("L'Etranger (work)")

            await request(app).post(`/logs/${log.id}/entries`).set(authA()).send({ finishedAt: '2020-01-01', edition: { title: 'Old edition' } })
            await request(app).post(`/logs/${log.id}/entries`).set(authA()).send({ finishedAt: '2024-01-01', edition: { title: "L'étranger" } })
            expect(await show()).toBe("L'étranger")

            const named = await request(app).put(`/logs/${log.id}`).set(authA()).send({ title: 'The Stranger' })
            expect(named.body.displayTitle).toBe('The Stranger')
            expect(await show()).toBe('The Stranger')

            const cleared = await request(app).put(`/logs/${log.id}`).set(authA()).send({ title: '' })
            expect(cleared.body.title).toBeNull()
            expect(await show()).toBe("L'étranger")
        })
    })

    describe('PUT /media/media-log', () => {
        const mediaData = (id: string) => ({ title: 'Searched Book', creator: 'Author', year: '2020', mediaType: 'book', source: 'openlibrary', sourceId: id })

        it('a first log carries its first entry; logging again adds a second entry and never overwrites the first', async () => {
            const sourceId = `/works/OLSEARCH${Date.now()}`
            const first = await request(app).put('/media/media-log').set(authA()).send({
                mediaData: mediaData(sourceId),
                logData: { status: 'completed', rating: 80, notes: 'good' },
                entry: { startedAt: '2026-06-01', finishedAt: '2026-06-05', edition: { title: 'The Stranger', language: 'English' } },
            })
            expect(first.statusCode).toBe(201)
            expect(first.body).toMatchObject({ logCreated: true, entryCreated: true })
            expect(first.body.log.entryCount).toBe(1)

            const second = await request(app).put('/media/media-log').set(authA()).send({
                mediaData: mediaData(sourceId),
                logData: { status: 'in progress' },
                entry: { startedAt: '2026-07-01' },
            })
            expect(second.statusCode).toBe(201)
            expect(second.body).toMatchObject({ logCreated: false, entryCreated: true })
            expect(second.body.log.entryCount).toBe(2)
            // fields that weren't sent keep their value
            expect(second.body.log).toMatchObject({ rating: 80, notes: 'good', status: 'in progress' })

            // the first entry is as it was
            const entries = await prisma.logEntry.findMany({ where: { logId: first.body.log.id }, orderBy: { startedAt: 'asc' } })
            expect(entries.map(e => day(e.finishedAt))).toEqual(['2026-06-05', null])
            expect(entries[0].edition).toEqual({ title: 'The Stranger', language: 'English' })

            // one media row, one log
            expect(await prisma.media.count({ where: { providerId: sourceId } })).toBe(1)
            expect(await prisma.userLogs.count({ where: { userId: a.userId, media: { providerId: sourceId } } })).toBe(1)
        })

        it('logging without an entry changes the log and adds none', async () => {
            const sourceId = `/works/OLSEARCHNOENTRY${Date.now()}`
            await request(app).put('/media/media-log').set(authA()).send({ mediaData: mediaData(sourceId), logData: { status: 'wishlist' } })
            const again = await request(app).put('/media/media-log').set(authA()).send({ mediaData: mediaData(sourceId), logData: { status: 'dropped' } })
            expect(again.body).toMatchObject({ logCreated: false, entryCreated: false })
            expect(again.body.log.entryCount).toBe(0)
        })

        it('dates in logData are a 400, they belong to the entry', async () => {
            const res = await request(app).put('/media/media-log').set(authA()).send({
                mediaData: mediaData(`/works/OLBAD${Date.now()}`), logData: { status: 'completed', startedAt: '2026-06-01' },
            })
            expect(res.statusCode).toBe(400)
            expect(res.body.message).toBe('Dates belong to an entry')
        })
    })

    describe('children and config', () => {
        it('a child season log reports its entryCount and entries; the count is one log per child', async () => {
            const type = await prisma.mediaType.findFirstOrThrow({ where: { name: 'movie' } })
            const show = await prisma.media.create({ data: { title: 'Entries Show', userId: systemUserId, mediaTypeId: type.id, provider: 'tmdb', providerId: `tv:entries${Date.now()}`, subtype: 'show' } })
            const season = await prisma.media.create({ data: { title: 'Season 1', userId: systemUserId, mediaTypeId: type.id, provider: 'tmdb', providerId: `tv:entries${Date.now()}:s1`, subtype: 'season', parentId: show.id, position: 1 } })
            const log = await newLog(season.id, { status: 'completed', rating: 70 })
            await request(app).post(`/logs/${log.id}/entries`).set(authA()).send({ finishedAt: '2025-01-01', progressEpisodes: 8 })
            await request(app).post(`/logs/${log.id}/entries`).set(authA()).send({ finishedAt: '2026-01-01', progressEpisodes: 8 })

            const res = await request(app).get(`/media/${show.id}/children`).set(authA())
            expect(res.statusCode).toBe(200)
            expect(res.body).toHaveLength(1)
            expect(res.body[0].log).toMatchObject({ entryCount: 2, rating: 70 })
            expect(day(res.body[0].log.entries[0].finishedAt)).toBe('2026-01-01')

            const logs = (await request(app).get('/logs').set(authA())).body.filter((l: { mediaId: string }) => l.mediaId === season.id)
            expect(logs).toHaveLength(1) // still one log; the show's summary counts it once
        })

        it('/config exposes the entry limits', async () => {
            const res = await request(app).get('/config')
            expect(res.body.limits.logs).toEqual({ maxEntriesPerLog: LIMITS.logs.maxEntriesPerLog, entryNoteMaxLength: LIMITS.logs.entryNoteMaxLength })
        })
    })
})
