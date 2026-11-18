import { jest } from '@jest/globals'
import { musicSearchService } from '@/services/search/lastFmSearchService.js'
import { musicBrainzService } from '@/services/search/musicBrainzService.js'
import prisma from '@/prismaClient.js'

describe('Tracklist Resolution and Fetching', () => {
    const originalFetch = global.fetch

    beforeEach(() => {
        jest.restoreAllMocks()
        // Provide dummy API key so getUserApiKey does not fail
        jest.spyOn(musicSearchService, 'getUserApiKey').mockResolvedValue('test-key')
        jest.spyOn(prisma.userLogs, 'findFirst').mockResolvedValue(null)
    })

    afterEach(() => {
        global.fetch = originalFetch
    })

    it('maps multiple Last.fm tracks correctly', async () => {
        const mockAlbumResponse = {
            album: {
                name: 'Loveless',
                artist: 'my bloody valentine',
                mbid: 'mbid-123',
                url: 'https://last.fm/music/my+bloody+valentine/Loveless',
                image: [{ size: 'large', '#text': 'https://cover.jpg' }],
                tracks: {
                    track: [
                        {
                            name: 'Only Shallow',
                            duration: '257',
                            url: 'https://last.fm/track/1',
                            '@attr': { rank: 1 },
                            artist: { name: 'my bloody valentine' },
                        },
                        {
                            name: 'Loomer',
                            duration: '158',
                            url: 'https://last.fm/track/2',
                            '@attr': { rank: 2 },
                            artist: { name: 'my bloody valentine' },
                        },
                    ],
                },
            },
        }

        global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => mockAlbumResponse,
        } as Response)

        // Mock DB calls in attachLogInfo to empty array
        jest.spyOn(prisma.media, 'findMany').mockResolvedValue([])

        const res = await musicSearchService.fetchAlbumTracks('1', 'my bloody valentine', 'Loveless')

        expect(res.provider).toBe('lastfm')
        expect(res.album.mediaType).toBe('music')
        expect(res.tracks[0].mediaType).toBe('music')
        expect(res.album.title).toBe('Loveless')
        expect(res.album.creator).toBe('my bloody valentine')
        expect(res.album.imageUrl).toBe('https://coverartarchive.org/release/mbid-123/front-250')
        expect(res.tracks[0].imageUrl).toBe('https://coverartarchive.org/release/mbid-123/front-250')
        expect(res.tracks).toHaveLength(2)
        expect(res.tracks[0].title).toBe('Only Shallow')
        expect(res.tracks[0].subtype).toBe('track')
        expect(res.tracks[0].details).toMatchObject({
            durationSec: 257,
        })
        expect(res.tracks[1].title).toBe('Loomer')
        expect(res.tracks[1].details).toMatchObject({
            durationSec: 158,
        })
    })

    it('handles a single track object from Last.fm response correctly', async () => {
        const mockAlbumResponse = {
            album: {
                name: 'Single Track EP',
                artist: 'Solo Artist',
                url: 'https://last.fm/music/solo',
                tracks: {
                    track: {
                        name: 'Solo Track',
                        duration: '180',
                        url: 'https://last.fm/track/solo',
                        '@attr': { rank: 1 },
                        artist: 'Solo Artist',
                    },
                },
            },
        }

        global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => mockAlbumResponse,
        } as Response)

        jest.spyOn(prisma.media, 'findMany').mockResolvedValue([])

        const res = await musicSearchService.fetchAlbumTracks('1', 'Solo Artist', 'Single Track EP')

        expect(res.provider).toBe('lastfm')
        expect(res.tracks).toHaveLength(1)
        expect(res.tracks[0].title).toBe('Solo Track')
        expect(res.tracks[0].details).toMatchObject({
            durationSec: 180,
        })
    })

    it('falls back to MusicBrainz when Last.fm has no tracks', async () => {
        // Last.fm returns album with empty tracks
        const mockLastFmResponse = {
            album: {
                name: 'Obscure Album',
                artist: 'Obscure Artist',
                mbid: 'mbid-obscure',
                tracks: { track: [] },
            },
        }

        global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => mockLastFmResponse,
        } as Response)

        const mbRelease = {
            id: 'mbid-obscure',
            title: 'Obscure Album',
            date: '2020-05-01',
            'artist-credit': [{ name: 'Obscure Artist' }],
            media: [
                {
                    position: 1,
                    tracks: [
                        {
                            id: 'mb-trk-1',
                            position: 1,
                            title: 'Track A',
                            length: 200000,
                        },
                        {
                            id: 'mb-trk-2',
                            position: 2,
                            title: 'Track B',
                            length: 150000,
                        },
                    ],
                },
            ],
        }

        jest.spyOn(musicBrainzService, 'getRelease').mockResolvedValue(mbRelease)
        jest.spyOn(prisma.media, 'findMany').mockResolvedValue([])

        const res = await musicSearchService.fetchAlbumTracks('1', 'Obscure Artist', 'Obscure Album', 'mbid-obscure')

        expect(res.provider).toBe('musicbrainz')
        expect(res.tracks).toHaveLength(2)
        expect(res.tracks[0].title).toBe('Track A')
        expect(res.tracks[0].source).toBe('musicbrainz')
        expect(res.tracks[0].mediaType).toBe('music')
        expect(res.tracks[0].sourceId).toBe('mb-trk-1')
        expect(res.tracks[0].details).toMatchObject({
            durationSec: 200,
        })
    })

    it('returns empty tracks and provider null when both Last.fm and MusicBrainz have no tracks', async () => {
        // Last.fm returns empty tracks
        global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ album: { name: 'Empty Album', artist: 'Unknown' } }),
        } as Response)

        jest.spyOn(musicBrainzService, 'getRelease').mockResolvedValue(null)
        jest.spyOn(musicBrainzService, 'searchRelease').mockResolvedValue(null)
        jest.spyOn(prisma.media, 'findMany').mockResolvedValue([])

        const res = await musicSearchService.fetchAlbumTracks('1', 'Unknown', 'Empty Album')

        expect(res.provider).toBeNull()
        expect(res.tracks).toEqual([])
        expect(res.album.title).toBe('Empty Album')
    })

    it('populates myLog and inLibrary when user has rated a track', async () => {
        const mockAlbumResponse = {
            album: {
                name: 'Souvlaki',
                artist: 'Slowdive',
                url: 'https://last.fm/music/slowdive/souvlaki',
                tracks: {
                    track: [
                        {
                            name: 'Alison',
                            url: 'https://last.fm/track/alison',
                            '@attr': { rank: 1 },
                        },
                        {
                            name: 'Machine Gun',
                            url: 'https://last.fm/track/machine-gun',
                            '@attr': { rank: 2 },
                        },
                    ],
                },
            },
        }

        global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => mockAlbumResponse,
        } as Response)

        const fakeMedia = [
            { id: '018f0000-0000-7000-8000-000000000101', sourceId: 'lastfm:https://last.fm/music/slowdive/souvlaki#1' },
            { id: '018f0000-0000-7000-8000-000000000102', sourceId: 'lastfm:https://last.fm/music/slowdive/souvlaki#2' },
        ]
        const fakeExt = [
            { mediaId: '018f0000-0000-7000-8000-000000000101', externalId: 'lastfm:https://last.fm/music/slowdive/souvlaki#1' },
            { mediaId: '018f0000-0000-7000-8000-000000000102', externalId: 'lastfm:https://last.fm/music/slowdive/souvlaki#2' },
        ]

        jest.spyOn(prisma.media, 'findMany').mockResolvedValue(fakeMedia as never)
        jest.spyOn(prisma.mediaExternalId, 'findMany').mockResolvedValue(fakeExt as never)
        jest.spyOn(prisma.userLogs, 'findMany').mockResolvedValue([
            { id: '018f0000-0000-7000-8000-000000000501', mediaId: '018f0000-0000-7000-8000-000000000101', rating: 95, status: 'completed' },
        ] as never)

        const res = await musicSearchService.fetchAlbumTracks('018f0000-0000-7000-8000-000000000042', 'Slowdive', 'Souvlaki')

        expect(res.tracks).toHaveLength(2)
        // Alison has log
        expect(res.tracks[0].inLibrary).toBe(true)
        expect(res.tracks[0].myLog).toEqual({
            id: '018f0000-0000-7000-8000-000000000501',
            rating: 95,
            status: 'completed',
        })
        // Machine Gun has media in DB but no user log
        expect(res.tracks[1].inLibrary).toBe(false)
        expect(res.tracks[1].myLog).toBeNull()
    })

    it('T1: accepts a release group and returns its tracks (MusicBrainz mocked)', async () => {
        const mbRelease = {
            id: 'mb-rel-early',
            title: 'Loveless',
            date: '1991-11-04',
            'artist-credit': [{ name: 'my bloody valentine' }],
            media: [
                {
                    position: 1,
                    tracks: [
                        { id: 'mb-trk-1', position: 1, title: 'Only Shallow', length: 257000 },
                        { id: 'mb-trk-2', position: 2, title: 'Loomer', length: 158000 },
                    ],
                },
            ],
        }

        jest.spyOn(musicBrainzService, 'getReleaseByReleaseGroup').mockResolvedValue(mbRelease)
        jest.spyOn(prisma.media, 'findMany').mockResolvedValue([])

        const res = await musicSearchService.fetchAlbumTracks('1', 'my bloody valentine', 'Loveless', undefined, 'rg-loveless-456')

        expect(res.provider).toBe('musicbrainz')
        expect(res.album.sourceId).toBe('rg-loveless-456')
        expect(res.album.externalIds).toEqual(expect.arrayContaining([{ provider: 'musicbrainz', id: 'rg-loveless-456' }]))
        expect(res.tracks).toHaveLength(2)
        expect(res.tracks[0].title).toBe('Only Shallow')
        expect(res.tracks[0].details).toMatchObject({
            durationSec: 257,
        })
    })

    it('T1: getReleaseByReleaseGroup picks the earliest official release', async () => {
        const mockReleasesData = {
            releases: [
                { id: 'rel-bootleg', status: 'Bootleg', date: '1990-01-01' },
                { id: 'rel-late', status: 'Official', date: '2008-05-01' },
                { id: 'rel-early', status: 'Official', date: '1991-11-04' },
            ],
        }

        const mockReleaseDetail = {
            id: 'rel-early',
            title: 'Loveless',
            date: '1991-11-04',
            'artist-credit': [{ name: 'my bloody valentine' }],
            media: [
                {
                    position: 1,
                    tracks: [{ id: 'trk-1', position: 1, title: 'Only Shallow' }],
                },
            ],
        }

        jest.spyOn(musicBrainzService, 'fetchJson').mockResolvedValue(mockReleasesData)
        jest.spyOn(musicBrainzService, 'getRelease').mockResolvedValue(mockReleaseDetail)

        const chosen = await musicBrainzService.getReleaseByReleaseGroup('rg-pick-early')
        expect(musicBrainzService.getRelease).toHaveBeenCalledWith('rel-early')
        expect(chosen?.id).toBe('rel-early')
    })
})
