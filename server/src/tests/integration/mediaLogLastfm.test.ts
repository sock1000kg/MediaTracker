import { jest } from '@jest/globals'
import type { SpiedFunction } from 'jest-mock'
import request from 'supertest'
import app from '@/app.js'
import { prisma } from '@/tests/jest.setup.js'

type Meta = { categories?: string[] | null, kind?: string, url?: string }

describe('Media log - Last.fm tag enrichment', () => {
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
            metadata: { url: 'https://last.fm/x', kind: 'album' },
        },
        logData: { status: 'completed' },
    })
    const log = (i: number, sourceId: string) =>
        request(app).put('/media/media-log').set('Authorization', `Bearer ${tokens[i]}`).send(payload(sourceId))
    const findMedia = (sourceId: string) => prisma.media.findFirst({ where: { source: 'lastfm', sourceId } })
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
        await prisma.media.deleteMany({ where: { source: 'lastfm', sourceId: { startsWith: 'lfm-test-' } } })
        await prisma.user.deleteMany({ where: { username: { in: users } } })
    })

    it('stores cleaned tags for new media and fetches once', async () => {
        const res = await log(0, 'lfm-test-1')
        expect(res.statusCode).toBeLessThan(300)
        expect(tagCalls()).toHaveLength(1)
        expect(String(tagCalls()[0][0])).toContain('album.gettoptags')
        const media = await findMedia('lfm-test-1')
        expect((media?.metadata as Meta).categories).toEqual(['shoegaze', 'Dream Pop'])
        expect((media?.metadata as Meta).kind).toBe('album')
    })

    it('does not refetch when logged again by another user', async () => {
        await log(0, 'lfm-test-1')
        const res = await log(1, 'lfm-test-1')
        expect(res.statusCode).toBeLessThan(300)
        expect(tagCalls()).toHaveLength(0)
    })

    it('does not refetch when categories is null', async () => {
        fetchSpy.mockImplementation(async () => new Response(JSON.stringify({ toptags: {} }), { status: 200 }))
        await log(0, 'lfm-test-2')
        expect((await findMedia('lfm-test-2'))?.metadata).toHaveProperty('categories', null)
        expect(tagCalls()).toHaveLength(1)
        await log(1, 'lfm-test-2')
        expect(tagCalls()).toHaveLength(1)
    })

    it('still logs when the tags call fails, leaving categories unset', async () => {
        fetchSpy.mockImplementation(async () => { throw new Error('network down') })
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
        const res = await log(0, 'lfm-test-3')
        warn.mockRestore()
        expect(res.statusCode).toBeLessThan(300)
        const media = await findMedia('lfm-test-3')
        expect(media).not.toBeNull()
        expect(media?.metadata).not.toHaveProperty('categories')

        fetchSpy.mockImplementation(async () => new Response('{}', { status: 500 }))
        const res2 = await log(1, 'lfm-test-3')
        expect(res2.statusCode).toBeLessThan(300)
        expect(tagCalls()).toHaveLength(2) // first failed call + retry on the next log
        expect(await findMedia('lfm-test-3')).not.toBeNull()
    })

    it('enriches pre-existing media without categories on next log', async () => {
        const system = await prisma.user.findFirstOrThrow({ where: { username: 'system' } })
        const type = await prisma.mediaType.findFirstOrThrow({ where: { name: 'music' } })
        await prisma.media.create({ data: {
            title: 'Souvlaki', creator: 'Slowdive', source: 'lastfm', sourceId: 'lfm-test-4',
            metadata: { url: 'https://last.fm/x' }, userId: system.id, mediaTypeId: type.id,
        } })
        const res = await log(0, 'lfm-test-4')
        expect(res.statusCode).toBeLessThan(300)
        expect(tagCalls()).toHaveLength(1)
        const meta = (await findMedia('lfm-test-4'))?.metadata as Meta
        expect(meta.categories).toEqual(['shoegaze', 'Dream Pop'])
        expect(meta.url).toBe('https://last.fm/x')
    })

    it('leaves book logging unchanged', async () => {
        const res = await request(app).put('/media/media-log').set('Authorization', `Bearer ${tokens[0]}`).send({
            mediaData: { title: 'Dune', mediaType: 'book', creator: 'Frank Herbert', year: 1965, source: 'open_library',
                sourceId: 'lfm-test-book', metadata: { categories: ['Science fiction'] } },
            logData: { status: 'completed' },
        })
        expect(res.statusCode).toBeLessThan(300)
        expect(fetchSpy).not.toHaveBeenCalled()
        const media = await prisma.media.findFirst({ where: { sourceId: 'lfm-test-book' } })
        expect((media?.metadata as Meta).categories).toEqual(['Science fiction'])
        await prisma.media.deleteMany({ where: { sourceId: 'lfm-test-book' } })
    })
})
