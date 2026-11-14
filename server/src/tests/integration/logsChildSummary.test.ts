import request from 'supertest'
import app from '@/app.js'
import { prisma } from '@/tests/jest.setup.js'

describe('Logs API childSummary and multi-user isolation', () => {
    const userA = 'ChildSumUserA'
    const userB = 'ChildSumUserB'
    let tokenA: string
    let _tokenB: string
    let userIdA: number
    let userIdB: number
    let albumId: number
    let track1Id: number
    let track2Id: number

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
        _tokenB = loginB.body.accessToken
        userIdB = regB.body.user?.id || loginB.body.user?.id

        const systemUser = await prisma.user.findFirst({ where: { username: 'system' } })
        const musicType = await prisma.mediaType.findFirst({ where: { name: 'music' } })

        // Create Album
        const album = await prisma.media.create({
            data: {
                title: 'Test Album For Summary',
                creator: 'Test Band',
                source: 'lastfm',
                sourceId: 'summary-test-album',
                mediaTypeId: musicType!.id,
                userId: systemUser!.id,
                metadata: { kind: 'album' },
            },
        })
        albumId = album.id

        // Create Track 1
        const track1 = await prisma.media.create({
            data: {
                title: 'Track One',
                creator: 'Test Band',
                source: 'lastfm',
                sourceId: 'summary-test-track-1',
                mediaTypeId: musicType!.id,
                userId: systemUser!.id,
                parentId: albumId,
                position: 1,
                metadata: { kind: 'track', trackNumber: 1 },
            },
        })
        track1Id = track1.id

        // Create Track 2
        const track2 = await prisma.media.create({
            data: {
                title: 'Track Two',
                creator: 'Test Band',
                source: 'lastfm',
                sourceId: 'summary-test-track-2',
                mediaTypeId: musicType!.id,
                userId: systemUser!.id,
                parentId: albumId,
                position: 2,
                metadata: { kind: 'track', trackNumber: 2 },
            },
        })
        track2Id = track2.id

        // User A logs Album (rating 80)
        await prisma.userLogs.create({
            data: {
                userId: userIdA,
                mediaId: albumId,
                status: 'completed',
                rating: 80,
                logged_at: new Date(),
            },
        })

        // User A logs Track 1 (rating 90) and Track 2 (rating 100) -> average should be 95
        await prisma.userLogs.create({
            data: {
                userId: userIdA,
                mediaId: track1Id,
                status: 'completed',
                rating: 90,
                logged_at: new Date(),
            },
        })
        await prisma.userLogs.create({
            data: {
                userId: userIdA,
                mediaId: track2Id,
                status: 'completed',
                rating: 100,
                logged_at: new Date(),
            },
        })

        // User B logs Track 1 with a low rating (rating 20) -> should NOT affect User A
        await prisma.userLogs.create({
            data: {
                userId: userIdB,
                mediaId: track1Id,
                status: 'completed',
                rating: 20,
                logged_at: new Date(),
            },
        })
    })

    afterAll(async () => {
        await prisma.userLogs.deleteMany({ where: { userId: { in: [userIdA, userIdB] } } })
        await prisma.media.deleteMany({ where: { id: { in: [albumId, track1Id, track2Id] } } })
        await prisma.user.deleteMany({ where: { username: { in: [userA, userB] } } })
    })

    it('computes childSummary counting only User A rated children and ignores User B ratings', async () => {
        const res = await request(app)
            .get('/logs')
            .set('Authorization', `Bearer ${tokenA}`)

        expect(res.statusCode).toBe(200)

        const albumLog = res.body.find((l: { mediaId: number }) => l.mediaId === albumId)
        expect(albumLog).toBeDefined()
        expect(albumLog.media.childSummary).toEqual({
            rated: 2,
            avgRating: 95,
        })
    })

    it('returns parentId on child tracks so client can group them under parent', async () => {
        const res = await request(app)
            .get('/logs')
            .set('Authorization', `Bearer ${tokenA}`)

        expect(res.statusCode).toBe(200)

        const trackLogs = res.body.filter((l: { mediaId: number }) =>
            l.mediaId === track1Id || l.mediaId === track2Id
        )
        expect(trackLogs).toHaveLength(2)
        expect(trackLogs[0].media.parentId).toBe(albumId)
        expect(trackLogs[1].media.parentId).toBe(albumId)
    })
})
