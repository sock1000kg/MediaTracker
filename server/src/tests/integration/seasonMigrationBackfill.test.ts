import request from 'supertest'
import app from '@/app.js'
import { prisma } from '@/tests/jest.setup.js'

describe('Season backfill and children relation', () => {
    const username = 'SeasonBackfillUser'
    let token: string
    let userId: number
    let showId: number
    let seasonId: number

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

        const systemUser = await prisma.user.findFirst({ where: { username: 'system' } })
        const tvType = await prisma.mediaType.findFirst({ where: { name: 'tv' } })

        // Create show
        const show = await prisma.media.create({
            data: {
                title: 'Severance',
                source: 'tmdb',
                sourceId: 'tv:95396',
                mediaTypeId: tvType!.id,
                userId: systemUser!.id,
                metadata: { kind: 'show', tmdbId: 95396 },
            },
        })
        showId = show.id

        // Create unlinked season (as it existed prior to the migration)
        const season = await prisma.media.create({
            data: {
                title: 'Severance - Season 1',
                source: 'tmdb',
                sourceId: 'tv:95396:s1',
                mediaTypeId: tvType!.id,
                userId: systemUser!.id,
                parentId: null,
                position: null,
                metadata: {
                    kind: 'season',
                    tmdbId: 95396,
                    seasonNumber: 1,
                    showTitle: 'Severance',
                },
            },
        })
        seasonId = season.id
    })

    afterAll(async () => {
        await prisma.userLogs.deleteMany({ where: { userId } })
        await prisma.media.deleteMany({
            where: {
                id: { in: [showId, seasonId] },
            },
        })
        await prisma.user.deleteMany({ where: { username } })
    })

    it('links unlinked season to show using backfill query logic and sets position', async () => {
        // Run migration backfill SQL block from 20261114130000_media_parents_and_partial_indexes
        await prisma.$executeRawUnsafe(`
            DO $$
            DECLARE
                sys_user_id INT;
                season_rec RECORD;
                show_id INT;
                target_tmdb_id TEXT;
                target_source_id TEXT;
                target_show_title TEXT;
            BEGIN
                SELECT id INTO sys_user_id FROM "User" WHERE username = 'system' LIMIT 1;

                FOR season_rec IN
                    SELECT id, "mediaTypeId", "imageUrl", metadata
                    FROM "Media"
                    WHERE metadata IS NOT NULL AND metadata->>'kind' = 'season' AND metadata->>'tmdbId' IS NOT NULL
                      AND id = ${seasonId}
                LOOP
                    target_tmdb_id := season_rec.metadata->>'tmdbId';
                    target_source_id := 'tv:' || target_tmdb_id;

                    SELECT id INTO show_id
                    FROM "Media"
                    WHERE source = 'tmdb' AND "sourceId" = target_source_id
                    LIMIT 1;

                    IF show_id IS NULL THEN
                        target_show_title := COALESCE(NULLIF(TRIM(season_rec.metadata->>'showTitle'), ''), 'Unknown title');
                        INSERT INTO "Media" (
                            title,
                            "mediaTypeId",
                            "imageUrl",
                            source,
                            "sourceId",
                            metadata,
                            "userId",
                            created_at
                        ) VALUES (
                            target_show_title,
                            season_rec."mediaTypeId",
                            season_rec."imageUrl",
                            'tmdb',
                            target_source_id,
                            jsonb_build_object('kind', 'show', 'tmdbId', target_tmdb_id::int),
                            sys_user_id,
                            now()
                        )
                        RETURNING id INTO show_id;
                    END IF;

                    UPDATE "Media"
                    SET "parentId" = show_id,
                        position = CASE
                            WHEN (season_rec.metadata->>'seasonNumber') ~ '^[0-9]+$'
                            THEN (season_rec.metadata->>'seasonNumber')::int
                            ELSE position
                        END
                    WHERE id = season_rec.id;
                END LOOP;
            END $$;
        `)

        const updatedSeason = await prisma.media.findUnique({
            where: { id: seasonId },
        })

        expect(updatedSeason?.parentId).toBe(showId)
        expect(updatedSeason?.position).toBe(1)
    })

    it('returns linked season via GET /media/:id/children', async () => {
        // Log the season
        await prisma.userLogs.create({
            data: {
                userId,
                mediaId: seasonId,
                status: 'completed',
                rating: 95,
                logged_at: new Date(),
            },
        })

        const res = await request(app)
            .get(`/media/${showId}/children`)
            .set('Authorization', `Bearer ${token}`)

        expect(res.statusCode).toBe(200)
        expect(res.body).toHaveLength(1)
        expect(res.body[0].id).toBe(seasonId)
        expect(res.body[0].position).toBe(1)
        expect(res.body[0].log).toMatchObject({
            rating: 95,
            status: 'completed',
        })
    })
})
