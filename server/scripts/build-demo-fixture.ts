import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import dotenv from "dotenv"
import { DEMO_PICKS, DEMO_COLLECTIONS, DemoPick } from "../src/tests/fixtures/demo/picks.js"
import { anilistThrottle, mapAniListMedia } from "../src/services/search/anilistSearchService.js"
import { tmdbSearchService, tmdbAuth, mapTmdbMovie } from "../src/services/search/tmdbSearchService.js"
import { rawgSearchService, mapRawgGame } from "../src/services/search/rawgSearchService.js"
import { musicSearchService } from "../src/services/search/lastFmSearchService.js"
import { SearchResult } from "../src/schemas/search/searchSchemas.js"
import { createUserAgentHeader } from "../src/utilities.js"
import { parseMalExport, defaultAniListResolver } from "../src/services/imports/malImportService.js"
import {
    unzipLetterboxdExport,
    mergeLetterboxdFiles,
    letterboxdFilmKey,
    resolveLetterboxdFilmsWithKey,
} from "../src/services/imports/letterboxdImportService.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load env: try server/.env first, then fallback to .env
const serverEnvPath = path.resolve(__dirname, "../.env")
if (fs.existsSync(serverEnvPath)) {
    dotenv.config({ path: serverEnvPath })
} else {
    dotenv.config()
}

const onlyFlag = process.argv.find(arg => arg.startsWith("--only="))?.split("=")[1]

const tmdbKey = process.env.TMDB_API_KEY
const rawgKey = process.env.RAWG_API_KEY
const lastfmKey = process.env.LASTFM_API_KEY

if (onlyFlag === "letterboxd") {
    if (!tmdbKey) {
        console.error("BLOCKED: Missing required API key in environment: TMDB_API_KEY")
        process.exit(1)
    }
} else {
    const missing: string[] = []
    if (!tmdbKey) missing.push("TMDB_API_KEY")
    if (!rawgKey) missing.push("RAWG_API_KEY")
    if (!lastfmKey) missing.push("LASTFM_API_KEY")

    if (missing.length > 0) {
        console.error(`BLOCKED: Missing required API keys in environment: ${missing.join(", ")}`)
        console.error(`Please set ${missing.join(", ")} in server/.env before building the demo fixture.`)
        process.exit(1)
    }
}

// Wire keys to service singletons
tmdbSearchService.getUserApiKey = async () => tmdbKey!
rawgSearchService.getUserApiKey = async () => rawgKey!
musicSearchService.getUserApiKey = async () => lastfmKey!

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function resolveAniList(pick: DemoPick): Promise<SearchResult> {
    const id = Number(pick.lookup.id)
    const type = pick.lookup.kind === "manga" ? "MANGA" : "ANIME"
    const mode = pick.lookup.kind === "manga" ? "manga" : "anime"

    const query = `query ($id: Int, $type: MediaType) {
      Media(id: $id, type: $type) {
        id
        idMal
        type
        format
        title {
          romaji
          english
          native
        }
        episodes
        duration
        chapters
        volumes
        startDate {
          year
        }
        averageScore
        genres
        tags {
          name
          rank
          isAdult
          isGeneralSpoiler
          isMediaSpoiler
        }
        studios(isMain: true) {
          nodes {
            name
          }
        }
        staff(perPage: 4, sort: RELEVANCE) {
          edges {
            role
            node {
              name {
                full
              }
            }
          }
        }
        coverImage {
          extraLarge
          large
        }
        siteUrl
        description(asHtml: false)
      }
    }`

    const res = await anilistThrottle(() =>
        fetch("https://graphql.anilist.co", {
            method: "POST",
            headers: {
                ...(createUserAgentHeader().headers as Record<string, string>),
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ query, variables: { id, type } }),
            signal: AbortSignal.timeout(10000),
        })
    )
    if (!res.ok) throw new Error(`AniList returned status ${res.status} for ID ${id}`)
    const json = await res.json()
    if (!json.data?.Media) throw new Error(`AniList media not found for ID ${id}`)
    return mapAniListMedia(mode, json.data.Media)
}

async function resolveTmdbTv(pick: DemoPick): Promise<{ media: SearchResult; parent?: SearchResult }> {
    const tmdbId = Number(pick.lookup.id)
    const { show, seasons } = await tmdbSearchService.fetchTvSeasons(0, tmdbId)
    if (pick.lookup.kind === "show") {
        return { media: show }
    }
    const targetSeasonNum = pick.lookup.seasonNumber ?? 1
    const season = seasons.find(s => (s.metadata as { seasonNumber?: number })?.seasonNumber === targetSeasonNum)
    if (!season) {
        throw new Error(`Season ${targetSeasonNum} not found for TMDB TV show ${tmdbId}`)
    }
    return { media: season, parent: show }
}

async function resolveTmdb(pick: DemoPick, key: string): Promise<SearchResult> {
    const tmdbId = Number(pick.lookup.id)
    const auth = tmdbAuth(key)
    const movieUrl = new URL(`https://api.themoviedb.org/3/movie/${tmdbId}`)
    movieUrl.searchParams.set("language", "en-US")
    for (const [k, v] of Object.entries(auth.params ?? {})) movieUrl.searchParams.set(k, v)

    const res = await fetch(movieUrl.toString(), {
        headers: { ...(createUserAgentHeader().headers as Record<string, string>), ...(auth.headers ?? {}) },
        signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`TMDB returned status ${res.status} for ID ${tmdbId}`)
    const rawMovie = await res.json()
    const mapped = mapTmdbMovie(rawMovie)

    const details = await tmdbSearchService.fetchMovieDetails(0, tmdbId)
    const directors = details.directors.length ? details.directors.join(", ") : null
    mapped.creator = directors
    mapped.metadata = {
        ...(mapped.metadata as object),
        runtime: details.runtime,
        imdbId: details.imdbId,
        categories: details.genres ?? (mapped.metadata as { categories?: string[] | null })?.categories ?? null,
    }
    return mapped
}

async function resolveRawg(pick: DemoPick, key: string): Promise<SearchResult> {
    const rawgId = Number(pick.lookup.id)
    const url = new URL(`https://api.rawg.io/api/games/${rawgId}`)
    url.searchParams.set("key", key)

    const res = await fetch(url.toString(), {
        headers: createUserAgentHeader().headers as Record<string, string>,
        signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`RAWG returned status ${res.status} for ID ${rawgId}`)
    const rawGame = await res.json()
    const mapped = mapRawgGame(rawGame)

    const details = await rawgSearchService.fetchGameDetails(0, rawgId)
    const developers = details.developers.length ? details.developers.join(", ") : null
    mapped.creator = developers
    mapped.description = details.description ?? mapped.description
    mapped.metadata = {
        ...(mapped.metadata as object),
        publishers: details.publishers.length ? details.publishers : null,
        categories: details.categories ?? (mapped.metadata as { categories?: string[] | null })?.categories ?? null,
    }
    return mapped
}

async function resolveLastFm(pick: DemoPick): Promise<{ media: SearchResult; parent?: SearchResult }> {
    const kind = pick.lookup.kind === "track" ? "track" : "album"
    const artist = pick.lookup.artist!
    const title = pick.lookup.title!

    if (kind === "track" && pick.lookup.album) {
        const albumTracks = await musicSearchService.fetchAlbumTracks(0, artist, pick.lookup.album)
        const match = albumTracks.tracks.find(t => t.title.toLowerCase() === title.toLowerCase())
            || albumTracks.tracks.find(t => t.title.toLowerCase().includes(title.toLowerCase()))
            || albumTracks.tracks[0]

        if (!match) {
            throw new Error(`Track ${title} not found on album ${pick.lookup.album} by ${artist}`)
        }

        const parent: SearchResult = {
            title: albumTracks.album.title,
            creator: albumTracks.album.artist,
            imageUrl: albumTracks.album.imageUrl,
            source: albumTracks.album.source,
            sourceId: albumTracks.album.sourceId,
            year: albumTracks.album.year,
            metadata: { kind: "album" },
        }

        const media: SearchResult = {
            title: match.title,
            creator: match.creator || artist,
            imageUrl: match.imageUrl ?? albumTracks.album.imageUrl,
            source: match.source,
            sourceId: match.sourceId,
            year: match.year ?? albumTracks.album.year,
            metadata: match.metadata,
        }

        return { media, parent }
    }

    let mapped: SearchResult
    if (kind === "album") {
        const res = await musicSearchService.searchAlbumsLastFm(0, title, 1)
        const match = res.results.find(r => r.creator?.toLowerCase().includes(artist.toLowerCase()))
            || res.results.find(r => r.title.toLowerCase().includes(title.toLowerCase()))
            || res.results[0]
        if (!match) throw new Error(`No Last.fm album found for ${artist} - ${title}`)
        mapped = { ...match, creator: match.creator || artist }
    } else {
        const res = await musicSearchService.searchTracksLastFm(0, title, 1)
        const match = res.results.find(r => r.creator?.toLowerCase().includes(artist.toLowerCase()))
            || res.results.find(r => r.title.toLowerCase().includes(title.toLowerCase()))
            || res.results[0]
        if (!match) throw new Error(`No Last.fm track found for ${artist} - ${title}`)
        mapped = { ...match, creator: match.creator || artist }
    }

    const topTags = await musicSearchService.fetchTopTags(0, kind, artist, title)
    mapped.metadata = {
        ...(mapped.metadata as object),
        kind,
        categories: topTags,
    }
    return { media: mapped }
}

export interface DemoFixtureItem {
    mediaTypeName: string
    media: SearchResult
    parent?: SearchResult
    log: DemoPick["log"]
    collections: string[]
}

export interface DemoFixture {
    collections: typeof DEMO_COLLECTIONS
    items: DemoFixtureItem[]
}

async function buildMalCache() {
    console.log("Building MAL AniList cache from user exports...")
    const animePath = path.resolve(__dirname, "../src/tests/fixtures/demo/exports/mal-anime.xml")
    const mangaPath = path.resolve(__dirname, "../src/tests/fixtures/demo/exports/mal-manga.xml")

    const animeBuf = fs.readFileSync(animePath)
    const mangaBuf = fs.readFileSync(mangaPath)

    const parsedAnime = parseMalExport(animeBuf)
    const parsedManga = parseMalExport(mangaBuf)

    console.log(`Resolving ${parsedAnime.entries.length} anime MAL entries via AniList...`)
    const animeMap = await defaultAniListResolver(parsedAnime.entries.map(e => e.malId), "anime")
    console.log(`Resolved ${animeMap.size}/${parsedAnime.entries.length} anime entries`)

    console.log(`Resolving ${parsedManga.entries.length} manga MAL entries via AniList...`)
    const mangaMap = await defaultAniListResolver(parsedManga.entries.map(e => e.malId), "manga")
    console.log(`Resolved ${mangaMap.size}/${parsedManga.entries.length} manga entries`)

    const cache: { anime: Record<string, SearchResult>; manga: Record<string, SearchResult> } = {
        anime: Object.fromEntries(animeMap.entries()),
        manga: Object.fromEntries(mangaMap.entries()),
    }

    const cacheJson = JSON.stringify(cache, null, 2)
    // Security check
    if (/api_key=/i.test(cacheJson) || /[?&]key=/i.test(cacheJson)) {
        throw new Error("SECURITY CHECK FAILED: Found api_key= or key= in the generated cache JSON!")
    }

    const cachePath = path.resolve(__dirname, "../src/tests/fixtures/demo/mal-anilist-cache.json")
    fs.writeFileSync(cachePath, cacheJson, "utf-8")
    console.log(`Successfully wrote MAL cache to ${cachePath}`)
}

async function buildLetterboxdCache(): Promise<string[]> {
    console.log("Building Letterboxd TMDB cache from user exports...")
    const letterboxdPath = path.resolve(__dirname, "../src/tests/fixtures/demo/exports/letterboxd.zip")
    if (!fs.existsSync(letterboxdPath)) {
        throw new Error(`Letterboxd export not found at ${letterboxdPath}`)
    }

    const zipBuf = fs.readFileSync(letterboxdPath)
    const files = unzipLetterboxdExport(zipBuf)
    const merged = mergeLetterboxdFiles(files)

    console.log(`Resolving ${merged.length} Letterboxd films via TMDB...`)
    const films = merged.map(f => ({ name: f.name, year: f.year }))
    const resolvedMap = await resolveLetterboxdFilmsWithKey(films, tmdbKey!)

    const cache: Record<string, SearchResult> = {}
    const unmatched: string[] = []

    for (const f of films) {
        const key = letterboxdFilmKey(f.name, f.year)
        const match = resolvedMap.get(key)
        if (match) {
            cache[key] = match
        } else {
            unmatched.push(`${f.name} (${f.year ?? "unknown"})`)
        }
    }

    console.log(`Resolved ${Object.keys(cache).length}/${films.length} Letterboxd entries`)
    if (unmatched.length > 0) {
        console.log(`Unmatched films (${unmatched.length}):`, unmatched)
    }

    const cacheJson = JSON.stringify(cache, null, 2)
    // Security check
    if (/api_key=/i.test(cacheJson) || /[?&]key=/i.test(cacheJson)) {
        throw new Error("SECURITY CHECK FAILED: Found api_key= or key= in the generated cache JSON!")
    }
    if (tmdbKey && cacheJson.includes(tmdbKey)) {
        throw new Error("SECURITY CHECK FAILED: TMDB_API_KEY leaked into the cache JSON!")
    }

    const cachePath = path.resolve(__dirname, "../src/tests/fixtures/demo/letterboxd-tmdb-cache.json")
    fs.writeFileSync(cachePath, cacheJson, "utf-8")
    console.log(`Successfully wrote Letterboxd TMDB cache to ${cachePath}`)

    return unmatched
}

async function buildFixture() {
    await buildMalCache()
    await buildLetterboxdCache()

    console.log(`Building demo fixture for ${DEMO_PICKS.length} picks...`)
    const items: DemoFixtureItem[] = []

    for (let i = 0; i < DEMO_PICKS.length; i++) {
        const pick = DEMO_PICKS[i]
        const label = `[${i + 1}/${DEMO_PICKS.length}] ${pick.mediaTypeName} - ${pick.lookup.title || pick.lookup.id}`
        console.log(`Resolving ${label}...`)

        let resolved: { media: SearchResult; parent?: SearchResult }
        if (pick.mediaTypeName === "tv") {
            resolved = await resolveTmdbTv(pick)
        } else if (pick.provider === "anilist") {
            resolved = { media: await resolveAniList(pick) }
        } else if (pick.provider === "tmdb") {
            resolved = { media: await resolveTmdb(pick, tmdbKey!) }
        } else if (pick.provider === "rawg") {
            resolved = { media: await resolveRawg(pick, rawgKey!) }
        } else if (pick.provider === "lastfm") {
            resolved = await resolveLastFm(pick)
        } else {
            throw new Error(`Unknown provider ${(pick as DemoPick).provider}`)
        }

        items.push({
            mediaTypeName: pick.mediaTypeName,
            media: resolved.media,
            parent: resolved.parent,
            log: pick.log,
            collections: pick.collections || [],
        })

        await sleep(350)
    }

    const fixture: DemoFixture = {
        collections: DEMO_COLLECTIONS,
        items,
    }

    const jsonStr = JSON.stringify(fixture, null, 2)

    // Security check: ensure no API keys or URLs containing api_key=/key= leaked into the JSON
    if (/api_key=/i.test(jsonStr) || /[?&]key=/i.test(jsonStr)) {
        throw new Error("SECURITY CHECK FAILED: Found api_key= or key= in the generated fixture JSON!")
    }
    if (tmdbKey && jsonStr.includes(tmdbKey)) {
        throw new Error("SECURITY CHECK FAILED: TMDB_API_KEY leaked into the fixture JSON!")
    }
    if (rawgKey && jsonStr.includes(rawgKey)) {
        throw new Error("SECURITY CHECK FAILED: RAWG_API_KEY leaked into the fixture JSON!")
    }
    if (lastfmKey && jsonStr.includes(lastfmKey)) {
        throw new Error("SECURITY CHECK FAILED: LASTFM_API_KEY leaked into the fixture JSON!")
    }

    const outputPath = path.resolve(__dirname, "../src/tests/fixtures/demo/demo-media.json")
    fs.writeFileSync(outputPath, jsonStr, "utf-8")
    console.log(`Successfully wrote demo fixture with ${items.length} items to ${outputPath}`)
}

async function main() {
    if (onlyFlag === "letterboxd") {
        await buildLetterboxdCache()
        return
    }
    await buildFixture()
}

main().catch(err => {
    console.error("Fixture build failed:", err)
    process.exit(1)
})
