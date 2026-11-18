import { DbClient } from "@/db.js"
import prisma from "@/prismaClient.js"
import { findUserById } from "@/repositories/authRepository.js"
import { AppError } from "@/api/domain/error.js"
import { decryptKey } from "@/utilities.js"
import {
    RateLimiter,
    musicBrainzLimiter,
    openLibraryLimiter,
    lastFmLimiter,
    anilistLimiter,
    tmdbLimiter,
    rawgLimiter,
    bggLimiter,
} from "@/services/search/rateLimiter.js"

export type StorageRule =
    | "stored"
    | "as-received"
    | "never"
    | { "refresh-after-days": number }

export interface RetryPolicy {
    retries: number
    onStatus: number[]
}

export interface ProviderEntry {
    name: string
    displayName: string
    host: string
    limiter: RateLimiter | null
    batchSize: number | null
    timeoutMs: number
    retryPolicy: RetryPolicy | null
    keyService: string | null
    missingKeyMessage: string | null
    storageRule: StorageRule
    refreshAfterDays?: number
    requiredCredit: string
    rateDisplay: string
}

export type ProviderName =
    | "musicbrainz"
    | "coverartarchive"
    | "openlibrary"
    | "lastfm"
    | "anilist"
    | "tmdb"
    | "rawg"
    | "bgg"

export const PROVIDER_REGISTRY: Record<ProviderName, ProviderEntry> = {
    musicbrainz: {
        name: "musicbrainz",
        displayName: "MusicBrainz",
        host: "musicbrainz.org",
        limiter: musicBrainzLimiter,
        batchSize: 25,
        timeoutMs: 8000,
        retryPolicy: { retries: 1, onStatus: [429, 503] },
        keyService: null,
        missingKeyMessage: null,
        storageRule: "stored",
        requiredCredit: "Tracklist from MusicBrainz · Curated genres CC BY-NC-SA",
        rateDisplay: "1/s",
    },
    coverartarchive: {
        name: "coverartarchive",
        displayName: "Cover Art Archive",
        host: "coverartarchive.org",
        limiter: null,
        batchSize: null,
        timeoutMs: 8000,
        retryPolicy: null,
        keyService: null,
        missingKeyMessage: null,
        storageRule: "stored",
        requiredCredit: "Covers from the Cover Art Archive",
        rateDisplay: "n/a",
    },
    openlibrary: {
        name: "openlibrary",
        displayName: "Open Library",
        host: "openlibrary.org",
        limiter: openLibraryLimiter,
        batchSize: 50,
        timeoutMs: 8000,
        retryPolicy: { retries: 1, onStatus: [429, 503] },
        keyService: null,
        missingKeyMessage: null,
        storageRule: "stored",
        requiredCredit: "Book data from Open Library",
        rateDisplay: "≈2/s",
    },
    lastfm: {
        name: "lastfm",
        displayName: "Last.fm",
        host: "ws.audioscrobbler.com",
        limiter: lastFmLimiter,
        batchSize: null,
        timeoutMs: 8000,
        retryPolicy: { retries: 1, onStatus: [429, 503] },
        keyService: "lastfm",
        missingKeyMessage: "Missing Music API Key",
        storageRule: "never",
        requiredCredit: "Music data from Last.fm",
        rateDisplay: "4/s",
    },
    anilist: {
        name: "anilist",
        displayName: "AniList",
        host: "graphql.anilist.co",
        limiter: anilistLimiter,
        batchSize: 50,
        timeoutMs: 8000,
        retryPolicy: { retries: 1, onStatus: [429, 503] },
        keyService: null,
        missingKeyMessage: null,
        storageRule: "stored",
        requiredCredit: "Anime and manga data from AniList",
        rateDisplay: "≈85/min",
    },
    tmdb: {
        name: "tmdb",
        displayName: "TMDB",
        host: "api.themoviedb.org",
        limiter: tmdbLimiter,
        batchSize: null,
        timeoutMs: 8000,
        retryPolicy: { retries: 1, onStatus: [429, 503] },
        keyService: "tmdb",
        missingKeyMessage: "Missing Movie API Key",
        storageRule: { "refresh-after-days": 180 },
        refreshAfterDays: 180,
        requiredCredit: "This product uses the TMDB API but is not endorsed or certified by TMDB.",
        rateDisplay: "4/s",
    },
    rawg: {
        name: "rawg",
        displayName: "RAWG",
        host: "api.rawg.io",
        limiter: rawgLimiter,
        batchSize: null,
        timeoutMs: 8000,
        retryPolicy: { retries: 1, onStatus: [429, 503] },
        keyService: "rawg",
        missingKeyMessage: "Missing Game API Key",
        storageRule: "stored",
        requiredCredit: "Video game data from RAWG",
        rateDisplay: "2/s",
    },
    bgg: {
        name: "bgg",
        displayName: "BoardGameGeek",
        host: "boardgamegeek.com",
        limiter: bggLimiter,
        batchSize: 20,
        timeoutMs: 8000,
        retryPolicy: { retries: 1, onStatus: [429, 503] },
        keyService: "bgg",
        missingKeyMessage: "Missing Board Game API Key",
        storageRule: "as-received",
        requiredCredit: "Board game data from BoardGameGeek · Powered by BGG",
        rateDisplay: "1/s",
    },
}

export const PROVIDERS = PROVIDER_REGISTRY

// Mapping from import source to the canonical provider we store from (P9)
export const IMPORT_STORAGE_PROVIDERS: Record<string, ProviderName> = {
    goodreads: "openlibrary",
    mal: "anilist",
    letterboxd: "tmdb",
    lastfm: "musicbrainz",
}

export function getStorageProviderForSource(source: string | null | undefined): ProviderName | null {
    if (!source) return null
    const lower = source.toLowerCase()
    if (lower in IMPORT_STORAGE_PROVIDERS) {
        return IMPORT_STORAGE_PROVIDERS[lower]
    }
    if (lower === "open_library" || lower === "openlibrary") return "openlibrary"
    if (lower === "jikan") return "anilist"
    if (lower in PROVIDER_REGISTRY) {
        return lower as ProviderName
    }
    return null
}

export function getProviderEntry(name: ProviderName): ProviderEntry {
    const entry = PROVIDER_REGISTRY[name]
    if (!entry) {
        throw new Error(`Unknown provider: ${name}`)
    }
    return entry
}

/**
 * Retrieves the user's decrypted API key for a keyed provider.
 * Strictly Bring Your Own Key: NEVER falls back to environment variables.
 */
export async function getUserApiKey(
    name: ProviderName,
    userId?: string
): Promise<string> {
    const provider = getProviderEntry(name)
    if (!provider.keyService) {
        throw new Error(`Provider ${name} does not use an API key`)
    }

    if (!userId) {
        throw new AppError(provider.missingKeyMessage ?? "Missing API Key", 404)
    }

    const user = await findUserById(userId)
    if (!user) throw new AppError("Non-existent userId", 404)

    const key = user.apiKeys
        .map(k => ({ ...k, key: decryptKey(k.key) }))
        .find(k => k.service === provider.keyService)?.key

    if (!key || !key.trim()) {
        throw new AppError(provider.missingKeyMessage ?? "Missing API Key", 404)
    }

    return key.trim()
}
