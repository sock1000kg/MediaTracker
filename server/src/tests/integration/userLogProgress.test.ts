import request from 'supertest'
import app from '@/app.js'
import { prisma } from '@/tests/jest.setup.js'

describe('P7: Per-user progress belongs on UserLogs, not shared Media', () => {
    const userA = 'ProgressUserA'
    const userB = 'ProgressUserB'
    let tokenA: string
    let tokenB: string
    let userIdA: string
    let userIdB: string
    let mediaId: string

    beforeAll(async () => {
        await prisma.user.deleteMany({ where: { username: { in: [userA, userB] } } })

        const regA = await request(app).post('/auth/register').send({
            username: userA,
            password: 'StrongPass1!',
            displayName: userA,
            registerKey: process.env.REGISTER_KEY,
        })
        const loginA = await request(app).post('/auth/login').send({
            username: userA,
            password: 'StrongPass1!',
        })
        tokenA = loginA.body.accessToken
        userIdA = regA.body.user?.id || loginA.body.user?.id

        const regB = await request(app).post('/auth/register').send({
            username: userB,
            password: 'StrongPass1!',
            displayName: userB,
            registerKey: process.env.REGISTER_KEY,
        })
        const loginB = await request(app).post('/auth/login').send({
            username: userB,
            password: 'StrongPass1!',
        })
        tokenB = loginB.body.accessToken
        userIdB = regB.body.user?.id || loginB.body.user?.id

        const systemUser = await prisma.user.findFirst({ where: { username: 'system' } })
        const animeType = await prisma.mediaType.findFirst({ where: { name: 'anime' } })

        const media = await prisma.media.create({
            data: {
                title: 'Frieren: Beyond Journey\'s End',
                provider: 'anilist',
                providerId: 'prog-test-frieren',
                mediaTypeId: animeType!.id,
                userId: systemUser!.id,
                details: {
                    episodeCount: 28,
                },
            },
        })
        mediaId = media.id
    })

    afterAll(async () => {
        await prisma.userLogs.deleteMany({ where: { userId: { in: [userIdA, userIdB] } } })
        await prisma.media.deleteMany({ where: { id: mediaId } })
        await prisma.user.deleteMany({ where: { username: { in: [userA, userB] } } })
    })

    it('allows two users to log the same anime with different watched episodes on their own logs', async () => {
        // User A logs with 14 episodes watched
        const resA = await request(app)
            .post('/logs')
            .set('Authorization', `Bearer ${tokenA}`)
            .send({
                mediaId,
                status: 'in progress',
                progress: { watchedEpisodes: 14 },
            })
        expect(resA.statusCode).toBe(201)

        // User B logs with 28 episodes watched
        const resB = await request(app)
            .post('/logs')
            .set('Authorization', `Bearer ${tokenB}`)
            .send({
                mediaId,
                status: 'completed',
                progress: { watchedEpisodes: 28 },
            })
        expect(resB.statusCode).toBe(201)

        // Fetch User A logs
        const logsA = await request(app).get('/logs').set('Authorization', `Bearer ${tokenA}`)
        const logA = logsA.body.find((l: { mediaId: string }) => l.mediaId === mediaId)
        expect(logA.progress).toEqual({ watchedEpisodes: 14 })

        // Fetch User B logs
        const logsB = await request(app).get('/logs').set('Authorization', `Bearer ${tokenB}`)
        const logB = logsB.body.find((l: { mediaId: string }) => l.mediaId === mediaId)
        expect(logB.progress).toEqual({ watchedEpisodes: 28 })

        // Verify shared Media.details was not polluted
        const mediaInDb = await prisma.media.findUnique({ where: { id: mediaId } })
        const details = mediaInDb?.details as Record<string, unknown>
        expect(details?.watchedEpisodes).toBeUndefined()
    })

    it('stores typed progress columns on UserLogs and formats as progress object in API', async () => {
        const systemUser = await prisma.user.findFirst({ where: { username: 'system' } })
        const mangaType = await prisma.mediaType.findFirst({ where: { name: 'manga' } })

        const mangaMedia = await prisma.media.create({
            data: {
                title: 'Legacy Manga',
                provider: 'mal',
                providerId: 'legacy-manga-1',
                mediaTypeId: mangaType!.id,
                userId: systemUser!.id,
                details: {
                    chapterCount: 100,
                },
            },
        })

        const res = await request(app)
            .post('/logs')
            .set('Authorization', `Bearer ${tokenA}`)
            .send({
                mediaId: mangaMedia.id,
                status: 'in progress',
                progress: { readChapters: 45, readVolumes: 5 },
            })
        expect(res.statusCode).toBe(201)

        const logInDb = await prisma.userLogs.findUnique({ where: { id: res.body.id } })
        expect(logInDb?.progressChapters).toBe(45)
        expect(logInDb?.progressVolumes).toBe(5)
        expect(logInDb?.progressEpisodes).toBeNull()

        const apiLogs = await request(app).get('/logs').set('Authorization', `Bearer ${tokenA}`)
        const apiLog = apiLogs.body.find((l: { id: string }) => l.id === res.body.id)
        expect(apiLog.progress).toEqual({
            readChapters: 45,
            readVolumes: 5,
        })

        // Cleanup
        await prisma.userLogs.deleteMany({ where: { id: res.body.id } })
        await prisma.media.deleteMany({ where: { id: mangaMedia.id } })
    })
})
