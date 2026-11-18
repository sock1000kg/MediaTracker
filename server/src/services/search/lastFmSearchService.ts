// services/musicSearchService.js
import {
    lastFmAlbumInfoResponseSchema,
    lastFmAlbumSearchResponseSchema,
    lastFmTopTagsResponseSchema,
    LastFmMusicItem,
    lastFmTrackSearchResponseSchema
} from "@/schemas/search/musicSchemas.js"

import { searchResultsSchema, searchResultSchema, SearchResult } from "@/schemas/search/searchSchemas.js"
import { createUserAgentHeader, decryptKey, fetchAndParse, validateSchema } from "@/utilities.js"
import { findUserById } from "@/repositories/authRepository.js"
import { ISearchService } from "./searchServiceInterface.js"
import { AppError } from "@/api/domain/error.js"
import { musicBrainzService, MusicBrainzRelease } from "./musicBrainzService.js"
import { musicBrainzClient } from "./musicBrainzClient.js"
import prisma from "@/prismaClient.js"

import { isJunkGenre, JUNK_MUSIC_TAGS } from "@/services/genreService.js"

export { JUNK_MUSIC_TAGS }
export const JUNK_LASTFM_TAGS = JUNK_MUSIC_TAGS

const MIN_TAG_COUNT = 5
const MAX_TAGS = 5

export function buildTopTagsUrl(kind: "album" | "track", artist: string, name: string, apiKey: string): URL {
    const url = new URL("https://ws.audioscrobbler.com/2.0/")
    url.searchParams.set("method", `${kind}.gettoptags`)
    url.searchParams.set("artist", artist)
    url.searchParams.set(kind, name)
    url.searchParams.set("autocorrect", "1")
    url.searchParams.set("api_key", apiKey)
    url.searchParams.set("format", "json")
    return url
}

export function buildAlbumInfoUrl(apiKey: string, artist?: string, album?: string, mbid?: string): URL {
    const url = new URL("https://ws.audioscrobbler.com/2.0/")
    url.searchParams.set("method", "album.getinfo")
    if (mbid) {
        url.searchParams.set("mbid", mbid)
    } else {
        if (artist) url.searchParams.set("artist", artist)
        if (album) url.searchParams.set("album", album)
    }
    url.searchParams.set("autocorrect", "1")
    url.searchParams.set("api_key", apiKey)
    url.searchParams.set("format", "json")
    return url
}

// Only drops junk, never merges or renames (tags stay as Last.fm returns them, apart from trimming)
export function cleanLastFmTags(tags: { name: string, count: number }[] | null | undefined, artist: string | null): string[] | null {
    const artistLower = artist?.trim().toLowerCase() ?? null
    const seen = new Set<string>()
    const result: string[] = []

    for (const { name, count } of tags ?? []) {
        const tag = name.trim()
        const lower = tag.toLowerCase()

        if (!tag) continue
        if (isJunkGenre(tag, "music")) continue
        if (artistLower && lower === artistLower) continue
        if (count < MIN_TAG_COUNT) continue
        if (seen.has(lower)) continue

        seen.add(lower)
        result.push(tag)
        if (result.length === MAX_TAGS) break
    }

    return result.length > 0 ? result : null
}

export class LastFmSearchService implements ISearchService {
    baseUrl = "https://ws.audioscrobbler.com/2.0/"
    maxResults = 30

    async getUserApiKey(userId: string): Promise<string> {
        const user = await findUserById(userId)
        if (!user) throw new AppError("Non-existent userId", 404)

        const lastfmKey = user.apiKeys
            .map(k => ({ ...k, key: decryptKey(k.key) }))
            .find(k => k.service === "lastfm")?.key

        if (!lastfmKey) {
            throw new AppError("Missing Music API Key", 404)
        }

        return lastfmKey
    }

    // Shared mapper for both albums & tracks → SearchResult[]
    mapResults(
        items: LastFmMusicItem[],
        kind: "album" | "track" = "album",
        releaseGroupMap?: Map<string, string | null>
    ): SearchResult[] {
        return items.map(i => {
            const mbid = i.mbid?.trim() || null
            let imageUrl: string | null = null
            let mbReleaseGroupId: string | null = null
            if (kind === "album" && mbid && releaseGroupMap) {
                const rgid = releaseGroupMap.get(mbid)
                if (rgid) {
                    imageUrl = musicBrainzClient.getCoverArtUrl(rgid)
                    mbReleaseGroupId = rgid
                }
            }

            return {
                mediaType: "music",
                title: i.name,
                creator: i.artist,
                creators: i.artist ? [{ name: i.artist, role: "artist" }] : undefined,
                year: null,
                description: null,
                source: "lastfm",
                sourceId: mbid || i.url,
                imageUrl,
                metadata: {
                    url: i.url,
                    kind,
                    ...(mbid ? { mbid } : {}),
                    ...(mbReleaseGroupId ? { mbReleaseGroupId } : {}),
                },
            }
        })
    }

    computePagination(items: LastFmMusicItem[], page: number) {
        return items.length < this.maxResults ? null : page + 1
    }

    // Fetches the top tags of one album/track, cleaned. Throws on any failure (callers decide what to do)
    async fetchTopTags(userId: string, kind: "album" | "track", artist: string, name: string): Promise<string[] | null> {
        const key = await this.getUserApiKey(userId)
        const url = buildTopTagsUrl(kind, artist, name, key)

        const init: RequestInit = { ...createUserAgentHeader(), signal: AbortSignal.timeout(5000) }
        const parsed = await fetchAndParse(url, lastFmTopTagsResponseSchema, "Last.fm API error", "Failed to fetch from Last.fm", init)

        return cleanLastFmTags(parsed.toptags?.tag ?? [], artist)
    }

    async searchTracksLastFm(userId: string, q: string, page = 1):
        Promise<{ results: SearchResult[], nextStartIndex: number | null}>
    {
        const key = await this.getUserApiKey(userId)

        const url = new URL(this.baseUrl)
        url.searchParams.set("method", "track.search")
        url.searchParams.set("track", q)
        url.searchParams.set("api_key", key)
        url.searchParams.set("format", "json")
        url.searchParams.set("limit", this.maxResults.toString())
        url.searchParams.set("page", page.toString())
        
        const headers = createUserAgentHeader()

        const parsed = await fetchAndParse(url, lastFmTrackSearchResponseSchema, "Last.fm API error", "Failed to fetch from Last.fm", headers)

        const items = parsed.results?.trackmatches?.track ?? []
        const nextPage = this.computePagination(items, page)

        const mapped = this.mapResults(items, "track")
        return {
            results: validateSchema(searchResultsSchema, mapped),
            nextStartIndex: nextPage
        }
    }

    async searchAlbumsLastFm(userId: string, q: string, page = 1):
        Promise<{ results: SearchResult[], nextStartIndex: number | null}>
    {
        const key = await this.getUserApiKey(userId)

        const url = new URL(this.baseUrl)
        url.searchParams.set("method", "album.search")
        url.searchParams.set("album", q)
        url.searchParams.set("api_key", key)
        url.searchParams.set("format", "json")
        url.searchParams.set("limit", this.maxResults.toString())
        url.searchParams.set("page", page.toString())

        const headers = createUserAgentHeader()
        // console.log(url.toString(), "\n", headers)

        const parsed = await fetchAndParse(url, lastFmAlbumSearchResponseSchema, "Last.fm API error", "Failed to fetch from Last.fm", headers)

        const items = parsed.results?.albummatches?.album ?? []
        const nextPage = this.computePagination(items, page)

        const mbids = items
            .map(i => i.mbid?.trim())
            .filter((id): id is string => Boolean(id))

        const { groups: releaseGroupMap } = mbids.length > 0
            ? await musicBrainzClient.resolveReleaseGroups(mbids)
            : { groups: new Map<string, string | null>() }

        const results = this.mapResults(items, "album", releaseGroupMap)
        return {
            results: validateSchema(searchResultsSchema, results),
            nextStartIndex: nextPage
        }
    }

    async fetchAlbumTracks(
        userId: string,
        artist: string,
        albumName: string,
        mbid?: string
    ): Promise<{
        album: SearchResult
        tracks: SearchResult[]
        provider: "lastfm" | "musicbrainz" | null
    }> {
        let albumResult: SearchResult | null = null
        let tracks: SearchResult[] = []
        let provider: "lastfm" | "musicbrainz" | null = null
        let lastFmMbid: string | null = mbid || null

        // 1. Try Last.fm first
        try {
            const key = await this.getUserApiKey(userId)
            const url = buildAlbumInfoUrl(key, artist, albumName, mbid)
            const init: RequestInit = { ...createUserAgentHeader(), signal: AbortSignal.timeout(10000) }
            const raw = await fetchAndParse(
                url,
                lastFmAlbumInfoResponseSchema,
                "Last.fm API error",
                "Failed to fetch from Last.fm",
                init
            )

            const album = raw.album
            if (album) {
                if (album.mbid) lastFmMbid = album.mbid
                const albumCaaUrl = lastFmMbid ? `https://coverartarchive.org/release/${lastFmMbid}/front-250` : null
                const albumSourceId = album.mbid || album.url || `${artist}:${album.name}`

                albumResult = {
                    mediaType: "music",
                    title: album.name,
                    creator: album.artist,
                    creators: album.artist ? [{ name: album.artist, role: "artist" }] : undefined,
                    year: null,
                    description: album.wiki?.summary || null,
                    source: "lastfm",
                    sourceId: albumSourceId,
                    imageUrl: albumCaaUrl,
                    metadata: {
                        url: album.url,
                        kind: "album",
                        ...(lastFmMbid ? { mbid: lastFmMbid } : {}),
                    },
                }

                const rawTracks = album.tracks?.track ?? []
                if (rawTracks.length > 0) {
                    provider = "lastfm"
                    tracks = rawTracks.map((t, idx) => {
                        const rankVal = t["@attr"]?.rank
                        const trackNumber = rankVal != null && !Number.isNaN(Number(rankVal)) ? Number(rankVal) : idx + 1
                        const trackArtist = (typeof t.artist === "object" ? t.artist?.name : t.artist) || album.artist
                        const sourceId = `lastfm:${albumSourceId}#${trackNumber}`
                        const dur = t.duration != null && !Number.isNaN(Number(t.duration)) && Number(t.duration) > 0 ? Number(t.duration) : null

                        return {
                            mediaType: "music",
                            title: t.name,
                            creator: trackArtist,
                            creators: trackArtist ? [{ name: trackArtist, role: "artist" }] : undefined,
                            year: null,
                            description: null,
                            source: "lastfm",
                            sourceId,
                            imageUrl: albumResult?.imageUrl ?? null,
                            metadata: {
                                kind: "track",
                                album: album.name,
                                albumSourceId,
                                trackNumber,
                                durationSec: dur,
                                url: t.url,
                            },
                        }
                    })
                }
            }
        } catch (error) {
            console.warn("Last.fm album.getInfo failed:", error)
        }

        // 2. MusicBrainz fallback if no tracks from Last.fm
        if (tracks.length === 0) {
            try {
                let release: MusicBrainzRelease | null = null
                if (lastFmMbid) {
                    release = await musicBrainzService.getRelease(lastFmMbid)
                }
                if (!release && (albumName || artist)) {
                    const searchArtist = artist || albumResult?.creator || ""
                    const searchAlbum = albumName || albumResult?.title || ""
                    if (searchAlbum) {
                        const foundMbid = await musicBrainzService.searchRelease(searchArtist, searchAlbum)
                        if (foundMbid) {
                            release = await musicBrainzService.getRelease(foundMbid)
                        }
                    }
                }

                if (release) {
                    const mbTracks = musicBrainzService.mapReleaseTracks(release, artist || albumResult?.creator || "")
                    if (mbTracks.length > 0) {
                        provider = "musicbrainz"
                        const caaUrl = musicBrainzService.getCoverArtUrl(release.id)

                        if (albumResult) {
                            if (!albumResult.imageUrl) {
                                albumResult.imageUrl = caaUrl
                            }
                        } else {
                            const albumArtist = release["artist-credit"]?.[0]?.name || artist
                            const albumYear = release.date && /^\d{4}/.test(release.date) ? release.date.slice(0, 4) : null
                            albumResult = {
                                mediaType: "music",
                                title: release.title,
                                creator: albumArtist,
                                creators: albumArtist ? [{ name: albumArtist, role: "artist" }] : undefined,
                                year: albumYear,
                                description: null,
                                source: "musicbrainz",
                                sourceId: release.id,
                                imageUrl: caaUrl,
                                metadata: {
                                    url: `https://musicbrainz.org/release/${release.id}`,
                                    kind: "album",
                                    mbid: release.id,
                                },
                            }
                        }

                        tracks = mbTracks.map(t => ({
                            ...t,
                            imageUrl: albumResult?.imageUrl ?? caaUrl,
                        }))
                    }
                }
            } catch (mbError) {
                console.warn("MusicBrainz fallback failed:", mbError)
            }
        }

        // Fallback albumResult if still null
        if (!albumResult) {
            albumResult = {
                mediaType: "music",
                title: albumName || "Unknown album",
                creator: artist || null,
                creators: artist ? [{ name: artist, role: "artist" }] : undefined,
                year: null,
                description: null,
                source: provider || "lastfm",
                sourceId: mbid || `${artist}:${albumName}`,
                imageUrl: null,
                metadata: {
                    kind: "album",
                },
            }
        }

        // 3. Attach myLog and inLibrary for tracks and album
        if (tracks.length > 0 && provider) {
            const trackSourceIds = tracks.map(t => t.sourceId)
            const trackMedias = await prisma.media.findMany({
                where: {
                    source: provider,
                    sourceId: { in: trackSourceIds },
                },
                select: { id: true, sourceId: true },
            })

            const mediaIdBySourceId = new Map<string, string>()
            for (const m of trackMedias) {
                if (m.sourceId) mediaIdBySourceId.set(m.sourceId, m.id)
            }

            const mediaIds = Array.from(mediaIdBySourceId.values())
            const userLogs = (userId && mediaIds.length > 0) ? await prisma.userLogs.findMany({
                where: {
                    userId,
                    mediaId: { in: mediaIds },
                },
                select: { id: true, mediaId: true, rating: true, status: true },
            }) : []

            const logByMediaId = new Map<string, { id: string; rating: number | null; status: string | null }>()
            for (const l of userLogs) {
                logByMediaId.set(l.mediaId, { id: l.id, rating: l.rating, status: l.status })
            }

            for (const track of tracks) {
                const mId = track.sourceId ? mediaIdBySourceId.get(track.sourceId) : undefined
                const log = mId != null ? logByMediaId.get(mId) ?? null : null
                track.myLog = log
                track.inLibrary = Boolean(log)
            }
        }

        if (userId && albumResult.sourceId) {
            const albumLog = await prisma.userLogs.findFirst({
                where: {
                    userId,
                    media: {
                        source: albumResult.source,
                        sourceId: albumResult.sourceId,
                    },
                },
                select: { id: true },
            })
            albumResult.inLibrary = Boolean(albumLog)
        }

        return {
            album: validateSchema(searchResultSchema, albumResult),
            tracks: validateSchema(searchResultsSchema, tracks),
            provider,
        }
    }
}

export const musicSearchService = new LastFmSearchService()
