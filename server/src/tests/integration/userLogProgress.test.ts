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
                source: 'anilist',
                sourceId: 'prog-test-frieren',
                mediaTypeId: animeType!.id,
                userId: systemUser!.id,
                metadata: {
                    kind: 'anime',
                    episodes: 28,
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

        // Verify shared Media.metadata was not polluted
        const mediaInDb = await prisma.media.findUnique({ where: { id: mediaId } })
        const meta = mediaInDb?.metadata as Record<string, unknown>
        expect(meta.watchedEpisodes).toBeUndefined()
    })

    it('data migration copies progress keys from media metadata to logs and removes them from media', async () => {
        const systemUser = await prisma.user.findFirst({ where: { username: 'system' } })
        const mangaType = await prisma.mediaType.findFirst({ where: { name: 'manga' } })

        // Create media with progress keys in metadata (legacy state)
        const legacyMedia = await prisma.media.create({
            data: {
                title: 'Legacy Manga',
                source: 'mal',
                sourceId: 'legacy-manga-1',
                mediaTypeId: mangaType!.id,
                userId: systemUser!.id,
                metadata: {
                    kind: 'manga',
                    chapters: 100,
                    readChapters: 45,
                    readVolumes: 5,
                },
            },
        })

        // Create log without progress
        const legacyLog = await prisma.userLogs.create({
            data: {
                userId: userIdA,
                mediaId: legacyMedia.id,
                status: 'in progress',
                logged_at: new Date(),
            },
        })

        // Run data migration SQL
        await prisma.$executeRawUnsafe(`
            DO $$
            DECLARE
                r RECORD;
                prog JSONB;
            BEGIN
                FOR r IN
                    SELECT l.id AS log_id, m.id AS media_id, m.metadata
                    FROM "UserLogs" l
                    JOIN "Media" m ON l."mediaId" = m.id
                    WHERE m.id = '${legacyMedia.id}'::uuid
                      AND (m.metadata ? 'watchedEpisodes' OR m.metadata ? 'readChapters' OR m.metadata ? 'readVolumes')
                LOOP
                    prog := jsonb_strip_nulls(jsonb_build_object(
                        'watchedEpisodes', r.metadata->'watchedEpisodes',
                        'readChapters', r.metadata->'readChapters',
                        'readVolumes', r.metadata->'readVolumes'
                    ));

                    IF prog <> '{}'::jsonb THEN
                        UPDATE "UserLogs"
                        SET progress = COALESCE(progress, '{}'::jsonb) || prog
                        WHERE id = r.log_id;
                    END IF;
                END LOOP;

                UPDATE "Media"
                SET metadata = (metadata - 'watchedEpisodes' - 'readChapters' - 'readVolumes')
                WHERE id = '${legacyMedia.id}'::uuid;
            END $$;
        `)

        const updatedLog = await prisma.userLogs.findUnique({ where: { id: legacyLog.id } })
        expect(updatedLog?.progress).toEqual({
            readChapters: 45,
            readVolumes: 5,
        })

        const updatedMedia = await prisma.media.findUnique({ where: { id: legacyMedia.id } })
        const meta = updatedMedia?.metadata as Record<string, unknown>
        expect(meta.readChapters).toBeUndefined()
        expect(meta.readVolumes).toBeUndefined()
        expect(meta.chapters).toBe(100)

        // Cleanup
        await prisma.userLogs.deleteMany({ where: { id: legacyLog.id } })
        await prisma.media.deleteMany({ where: { id: legacyMedia.id } })
    })
})
