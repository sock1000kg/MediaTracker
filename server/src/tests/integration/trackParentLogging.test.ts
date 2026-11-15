import request from 'supertest'
import app from '@/app.js'
import { prisma } from '@/tests/jest.setup.js'

describe('Track parent linking and duplicate track names', () => {
    const username = 'TrackParentUser'
    let token: string
    let userId: string

    beforeAll(async () => {
        await prisma.user.deleteMany({ where: { username } })
        const reg = await request(app).post('/auth/register').send({
            username,
            password: 'StrongPass1!',
            displayName: username,
            registerKey: process.env.REGISTER_KEY,
        })
        const login = await request(app).post('/auth/login').send({
            username,
            password: 'StrongPass1!',
        })
        token = login.body.accessToken
        userId = reg.body.user?.id || login.body.user?.id
    })

    afterAll(async () => {
        await prisma.userLogs.deleteMany({ where: { userId } })
        await prisma.media.deleteMany({
            where: {
                OR: [
                    { sourceId: { startsWith: 'test-album-' } },
                    { sourceId: { startsWith: 'test-track-' } },
                    { title: 'Intro', creator: 'SameArtist' },
                ],
            },
        })
        await prisma.user.deleteMany({ where: { username } })
    })

    it('creates album without user log and links child with parentId and position', async () => {
        const payload = {
            mediaData: {
                title: 'Only Shallow',
                mediaType: 'music',
                creator: 'my bloody valentine',
                year: 1991,
                source: 'lastfm',
                sourceId: 'test-track-only-shallow',
                metadata: { kind: 'track', trackNumber: 1, durationSec: 257 },
            },
            parent: {
                title: 'Loveless',
                creator: 'my bloody valentine',
                year: 1991,
                source: 'lastfm',
                sourceId: 'test-album-loveless',
                metadata: { kind: 'album' },
            },
            logData: {
                status: 'completed',
                rating: 100,
            },
        }

        const res = await request(app)
            .put('/media/media-log')
            .set('Authorization', `Bearer ${token}`)
            .send(payload)

        expect(res.statusCode).toBe(201)

        // Verify album was created under system user
        const album = await prisma.media.findFirst({
            where: { source: 'lastfm', sourceId: 'test-album-loveless' },
            include: { logs: true },
        })
        expect(album).not.toBeNull()
        // Crucial: Album itself does NOT have a log for this user
        const albumUserLog = album?.logs.find(l => l.userId === userId)
        expect(albumUserLog).toBeUndefined()

        // Verify track was created and linked to album
        const track = await prisma.media.findFirst({
            where: { source: 'lastfm', sourceId: 'test-track-only-shallow' },
            include: { logs: true },
        })
        expect(track).not.toBeNull()
        expect(track?.parentId).toBe(album?.id)
        expect(track?.position).toBe(1)

        const trackUserLog = track?.logs.find(l => l.userId === userId)
        expect(trackUserLog).toBeDefined()
        expect(trackUserLog?.rating).toBe(100)
    })

    it('reuses existing album when logging second track of the album', async () => {
        const payload = {
            mediaData: {
                title: 'Loomer',
                mediaType: 'music',
                creator: 'my bloody valentine',
                year: 1991,
                source: 'lastfm',
                sourceId: 'test-track-loomer',
                metadata: { kind: 'track', trackNumber: 2, durationSec: 158 },
            },
            parent: {
                title: 'Loveless',
                creator: 'my bloody valentine',
                year: 1991,
                source: 'lastfm',
                sourceId: 'test-album-loveless',
                metadata: { kind: 'album' },
            },
            logData: {
                status: 'completed',
                rating: 92,
            },
        }

        const res = await request(app)
            .put('/media/media-log')
            .set('Authorization', `Bearer ${token}`)
            .send(payload)

        expect(res.statusCode).toBe(201)

        const albumCount = await prisma.media.count({
            where: { source: 'lastfm', sourceId: 'test-album-loveless' },
        })
        expect(albumCount).toBe(1)

        const album = await prisma.media.findFirst({
            where: { source: 'lastfm', sourceId: 'test-album-loveless' },
        })
        const track2 = await prisma.media.findFirst({
            where: { source: 'lastfm', sourceId: 'test-track-loomer' },
        })
        expect(track2?.parentId).toBe(album?.id)
        expect(track2?.position).toBe(2)
    })

    it('allows two different "Intro" tracks by the same artist and year to both save', async () => {
        // Track 1 on Album A
        const track1 = {
            mediaData: {
                title: 'Intro',
                mediaType: 'music',
                creator: 'SameArtist',
                year: 2020,
                source: 'lastfm',
                sourceId: 'test-track-intro-album-a',
                metadata: { kind: 'track', trackNumber: 1 },
            },
            parent: {
                title: 'Album A',
                creator: 'SameArtist',
                year: 2020,
                source: 'lastfm',
                sourceId: 'test-album-a',
                metadata: { kind: 'album' },
            },
            logData: { status: 'completed', rating: 80 },
        }

        // Track 2 on Album B (same artist, same title "Intro", same year 2020)
        const track2 = {
            mediaData: {
                title: 'Intro',
                mediaType: 'music',
                creator: 'SameArtist',
                year: 2020,
                source: 'lastfm',
                sourceId: 'test-track-intro-album-b',
                metadata: { kind: 'track', trackNumber: 1 },
            },
            parent: {
                title: 'Album B',
                creator: 'SameArtist',
                year: 2020,
                source: 'lastfm',
                sourceId: 'test-album-b',
                metadata: { kind: 'album' },
            },
            logData: { status: 'completed', rating: 85 },
        }

        const res1 = await request(app)
            .put('/media/media-log')
            .set('Authorization', `Bearer ${token}`)
            .send(track1)
        expect(res1.statusCode).toBe(201)

        // In the old schema with @@unique([creator, title, year, mediaTypeId]), this second call threw a duplicate key error!
        const res2 = await request(app)
            .put('/media/media-log')
            .set('Authorization', `Bearer ${token}`)
            .send(track2)
        expect(res2.statusCode).toBe(201)

        const savedTracks = await prisma.media.findMany({
            where: {
                title: 'Intro',
                creator: 'SameArtist',
                year: 2020,
            },
        })
        expect(savedTracks).toHaveLength(2)
    })
})
