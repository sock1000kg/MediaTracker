import { jest } from '@jest/globals'
import type { SpiedFunction } from 'jest-mock'
import request from 'supertest'
import app from '@/app.js'
import { prisma } from '@/tests/jest.setup.js'

describe('Media log - Last.fm data is never stored', () => {
    const users = ['LfmUserA', 'LfmUserB']
    const tokens: string[] = []
    let fetchSpy: SpiedFunction<typeof fetch>

    const tagsBody = { toptags: { tag: [
        { name: 'shoegaze', count: 100 }, { name: 'seen live', count: 80 }, { name: 'Dream Pop', count: 60 },
        { name: '2019', count: 40 }, { name: 'dream pop', count: 30 }, { name: 'Slowdive', count: 20 }, { name: 'noise pop', count: 3 },
    ] } }
    const okTags = () => new Response(JSON.stringify(tagsBody), { status: 200, headers: { 'Content-Type': 'application/json' } })

    const payload = (sourceId: string) => ({
        mediaData: {
            title: 'Souvlaki', mediaType: 'music', creator: 'Slowdive', year: null, description: null,
            source: 'lastfm', sourceId, imageUrl: null,
            subtype: 'album',
        },
        logData: { status: 'completed' },
    })
    const log = (i: number, sourceId: string) =>
        request(app).put('/media/media-log').set('Authorization', `Bearer ${tokens[i]}`).send(payload(sourceId))
    const findMedia = (sourceId: string) => prisma.media.findFirst({ where: { provider: 'lastfm', providerId: sourceId } })
    const tagCalls = () => fetchSpy.mock.calls.filter(c => String(c[0]).includes('gettoptags'))

    beforeAll(async () => {
        for (const username of users) {
            await prisma.user.deleteMany({ where: { username } })
            await request(app).post('/auth/register')
                .send({ username, password: 'StrongPass1!', displayName: username, registerKey: process.env.REGISTER_KEY })
            const login = await request(app).post('/auth/login').send({ username, password: 'StrongPass1!' })
            tokens.push(login.body.accessToken)
            const key = await request(app).post('/api-key').set('Authorization', `Bearer ${login.body.accessToken}`)
                .send({ service: 'lastfm', key: 'test-key' })
            expect(key.statusCode).toBe(201)
        }
    })

    beforeEach(() => {
        fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => okTags())
    })
    afterEach(() => fetchSpy.mockRestore())

    afterAll(async () => {
        await prisma.media.deleteMany({ where: { provider: 'lastfm', providerId: { startsWith: 'lfm-test-' } } })
        await prisma.user.deleteMany({ where: { username: { in: users } } })
    })

    const genresOf = async (mediaId: string) =>
        (await prisma.mediaGenre.findMany({ where: { mediaId }, include: { genre: true }, orderBy: { position: 'asc' } })).map(mg => mg.genre.name)

    it('never requests or stores Last.fm tags for new media', async () => {
        const res = await log(0, 'lfm-test-1')
        expect(res.statusCode).toBeLessThan(300)
        expect(tagCalls()).toHaveLength(0)
        const media = await findMedia('lfm-test-1')
        expect(await genresOf(media!.id)).toEqual([])
        expect(media?.subtype).toBe('album')
        expect(media?.syncCheckedAt).not.toBeNull()
    })

    it('makes no tag request when logged again by another user', async () => {
        await log(0, 'lfm-test-1')
        const res = await log(1, 'lfm-test-1')
        expect(res.statusCode).toBeLessThan(300)
        expect(tagCalls()).toHaveLength(0)
    })

    it('still logs when Last.fm is down: no tags, no failure', async () => {
        fetchSpy.mockImplementation(async () => { throw new Error('network down') })
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
        const res = await log(0, 'lfm-test-3')
        warn.mockRestore()
        expect(res.statusCode).toBeLessThan(300)
        const media = await findMedia('lfm-test-3')
        expect(media).not.toBeNull()
        expect(await genresOf(media!.id)).toEqual([])
    })

    it('leaves a pre-existing media without genres alone: no tag request, no genres', async () => {
        const system = await prisma.user.findFirstOrThrow({ where: { username: 'system' } })
        const type = await prisma.mediaType.findFirstOrThrow({ where: { name: 'music' } })
        const preMedia = await prisma.media.create({ data: {
            title: 'Souvlaki', creator: 'Slowdive', provider: 'lastfm', providerId: 'lfm-test-4',
            userId: system.id, mediaTypeId: type.id, subtype: 'album',
        } })
        await prisma.mediaExternalId.create({
            data: { mediaId: preMedia.id, provider: 'lastfm', externalId: 'lfm-test-4' }
        })
        const res = await log(0, 'lfm-test-4')
        expect(res.statusCode).toBeLessThan(300)
        expect(tagCalls()).toHaveLength(0)
        const media = await findMedia('lfm-test-4')
        expect(await genresOf(media!.id)).toEqual([])
        expect(media?.syncCheckedAt).not.toBeNull()
    })

    it('leaves book logging unchanged', async () => {
        const res = await request(app).put('/media/media-log').set('Authorization', `Bearer ${tokens[0]}`).send({
            mediaData: { title: 'Dune', mediaType: 'book', creator: 'Frank Herbert', year: 1965, source: 'openlibrary',
                sourceId: 'lfm-test-book', genres: ['Science fiction'] },
            logData: { status: 'completed' },
        })
        expect(res.statusCode).toBeLessThan(300)
        expect(fetchSpy).not.toHaveBeenCalled()
        const media = await prisma.media.findFirst({ where: { providerId: 'lfm-test-book' } })
        const genres = (await prisma.mediaGenre.findMany({ where: { mediaId: media!.id }, include: { genre: true } })).map(mg => mg.genre.name)
        expect(genres).toEqual(['Science fiction'])
        await prisma.media.deleteMany({ where: { providerId: 'lfm-test-book' } })
    })
})
