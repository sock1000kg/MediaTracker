import request from 'supertest'
import app from '@/app.js'
import { prisma } from '@/tests/jest.setup.js'

describe('Log Dates API - startedAt and finishedAt', () => {
    const username = 'LogDatesUser'
    const password = 'StrongPass1!'
    const registerKey = process.env.REGISTER_KEY
    let token: string
    let userId: string
    let mediaId: string

    beforeAll(async () => {
        await prisma.user.deleteMany({ where: { username } })
        const reg = await request(app).post('/auth/register')
            .send({ username, password, displayName: 'LogDates Tester', registerKey })
        expect(reg.statusCode).toBe(201)
        const login = await request(app).post('/auth/login').send({ username, password })
        token = login.body.accessToken
        const user = await prisma.user.findUnique({ where: { username } })
        userId = user!.id

        // Create a media item to log
        const bookType = await prisma.mediaType.findFirst({ where: { name: 'book' } })
        const media = await prisma.media.create({
            data: {
                title: 'Test Book For Log Dates',
                creator: 'Test Author',
                year: 2020,
                userId,
                mediaTypeId: bookType!.id,
            }
        })
        mediaId = media.id
    })

    test('creates a log with startedAt and finishedAt at day precision (noon UTC)', async () => {
        const res = await request(app).post('/logs')
            .set('Authorization', `Bearer ${token}`)
            .send({
                mediaId,
                status: 'completed',
                rating: 85,
                notes: 'Great book',
                startedAt: '2026-05-01',
                finishedAt: '2026-05-10',
            })
        expect(res.statusCode).toBe(201)
        expect(res.body.started_at).toBe('2026-05-01T12:00:00.000Z')
        expect(res.body.finished_at).toBe('2026-05-10T12:00:00.000Z')

        // GET /logs returns started_at and finished_at
        const getRes = await request(app).get('/logs').set('Authorization', `Bearer ${token}`)
        expect(getRes.statusCode).toBe(200)
        const found = getRes.body.find((l: { id: string }) => l.id === res.body.id)
        expect(found).toBeDefined()
        expect(found.started_at).toBe('2026-05-01T12:00:00.000Z')
        expect(found.finished_at).toBe('2026-05-10T12:00:00.000Z')
    })

    test('updates startedAt and finishedAt on an existing log', async () => {
        const logs = await request(app).get('/logs').set('Authorization', `Bearer ${token}`)
        const logId = logs.body[0].id

        const res = await request(app).put(`/logs/${logId}`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                startedAt: '2026-05-02',
                finishedAt: '2026-05-12',
            })
        expect(res.statusCode).toBe(200)
        expect(res.body.started_at).toBe('2026-05-02T12:00:00.000Z')
        expect(res.body.finished_at).toBe('2026-05-12T12:00:00.000Z')
    })

    test('clears dates when explicitly passed as null', async () => {
        const logs = await request(app).get('/logs').set('Authorization', `Bearer ${token}`)
        const logId = logs.body[0].id

        const res = await request(app).put(`/logs/${logId}`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                startedAt: null,
                finishedAt: null,
            })
        expect(res.statusCode).toBe(200)
        expect(res.body.started_at).toBeNull()
        expect(res.body.finished_at).toBeNull()
    })

    test('omitting dates on update leaves them unchanged', async () => {
        const logs = await request(app).get('/logs').set('Authorization', `Bearer ${token}`)
        const logId = logs.body[0].id

        // First set dates
        await request(app).put(`/logs/${logId}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ startedAt: '2026-05-01', finishedAt: '2026-05-05' })

        // Update status only (omit startedAt and finishedAt)
        const res = await request(app).put(`/logs/${logId}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ status: 'in progress' })
        expect(res.statusCode).toBe(200)
        expect(res.body.status).toBe('in progress')
        expect(res.body.started_at).toBe('2026-05-01T12:00:00.000Z')
        expect(res.body.finished_at).toBe('2026-05-05T12:00:00.000Z')
    })

    test('validation error: finishedAt < startedAt gives 400 "Finished date can\'t be before the start date"', async () => {
        // On update
        const logs = await request(app).get('/logs').set('Authorization', `Bearer ${token}`)
        const logId = logs.body[0].id

        const resUpdate = await request(app).put(`/logs/${logId}`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                startedAt: '2026-05-10',
                finishedAt: '2026-05-01',
            })
        expect(resUpdate.statusCode).toBe(400)
        expect(resUpdate.body.message).toBe("Finished date can't be before the start date")

        // Cross-field validation when one date is omitted
        // Set startedAt to 2026-05-10
        await request(app).put(`/logs/${logId}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ startedAt: '2026-05-10', finishedAt: null })
        // Now try setting finishedAt to 2026-05-05 (before existing startedAt)
        const resPartial = await request(app).put(`/logs/${logId}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ finishedAt: '2026-05-05' })
        expect(resPartial.statusCode).toBe(400)
        expect(resPartial.body.message).toBe("Finished date can't be before the start date")
    })

    test('validation error: date more than 1 day in the future gives 400', async () => {
        const logs = await request(app).get('/logs').set('Authorization', `Bearer ${token}`)
        const logId = logs.body[0].id

        const farFuture = '2099-01-01'
        const resStarted = await request(app).put(`/logs/${logId}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ startedAt: farFuture })
        expect(resStarted.statusCode).toBe(400)
        expect(resStarted.body.message).toMatch(/future/i)

        const resFinished = await request(app).put(`/logs/${logId}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ finishedAt: farFuture })
        expect(resFinished.statusCode).toBe(400)
        expect(resFinished.body.message).toMatch(/future/i)
    })

    test('PUT /media/media-log accepts startedAt and finishedAt and validates them', async () => {
        const mediaData = {
            title: 'MediaLog Book with Dates',
            creator: 'Some Author',
            year: '2021',
            mediaType: 'book',
            source: 'open_library',
            sourceId: 'OL-DATES-1',
        }

        // Invalid: finished < started
        const badRes = await request(app).put('/media/media-log')
            .set('Authorization', `Bearer ${token}`)
            .send({
                mediaData,
                logData: {
                    status: 'completed',
                    startedAt: '2026-06-10',
                    finishedAt: '2026-06-01',
                }
            })
        expect(badRes.statusCode).toBe(400)
        expect(badRes.body.message).toBe("Finished date can't be before the start date")

        // Valid
        const goodRes = await request(app).put('/media/media-log')
            .set('Authorization', `Bearer ${token}`)
            .send({
                mediaData,
                logData: {
                    status: 'completed',
                    startedAt: '2026-06-01',
                    finishedAt: '2026-06-05',
                }
            })
        expect(goodRes.statusCode).toBe(201)
        expect(goodRes.body.logCreated).toBe(true)
        expect(goodRes.body.log.started_at).toBe('2026-06-01T12:00:00.000Z')
        expect(goodRes.body.log.finished_at).toBe('2026-06-05T12:00:00.000Z')

        // Update via PUT /media/media-log
        const updateRes = await request(app).put('/media/media-log')
            .set('Authorization', `Bearer ${token}`)
            .send({
                mediaData,
                logData: {
                    status: 'completed',
                    startedAt: '2026-06-02',
                    finishedAt: '2026-06-07',
                }
            })
        expect(updateRes.statusCode).toBe(201)
        expect(updateRes.body.logCreated).toBe(false)
        expect(updateRes.body.log.started_at).toBe('2026-06-02T12:00:00.000Z')
        expect(updateRes.body.log.finished_at).toBe('2026-06-07T12:00:00.000Z')
    })
})
