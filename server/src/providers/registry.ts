import { ApiKeyService } from "@/db.js"
import type { AuthConfig } from "./auth.js"
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
    hosts?: string[]
    auth: AuthConfig | null
    keyService: ApiKeyService | null
    missingKeyMessage: string | null
    storageRule: StorageRule
    /** Human-readable rate, checked against providers.html by the docs drift test */
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
        auth: null,
        keyService: null,
        missingKeyMessage: null,
        storageRule: "stored",
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
        auth: null,
        keyService: null,
        missingKeyMessage: null,
        storageRule: "stored",
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
        auth: null,
        keyService: null,
        missingKeyMessage: null,
        storageRule: "stored",
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
        auth: { scheme: "query", param: "api_key" },
        keyService: "lastfm",
        missingKeyMessage: "Missing Music API Key",
        storageRule: "never",
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
        auth: null,
        keyService: null,
        missingKeyMessage: null,
        storageRule: "stored",
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
        auth: { scheme: "tmdb" },
        keyService: "tmdb",
        missingKeyMessage: "Missing Movie API Key",
        storageRule: { "refresh-after-days": 180 },
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
        auth: { scheme: "query", param: "key" },
        keyService: "rawg",
        missingKeyMessage: "Missing Game API Key",
        storageRule: "stored",
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
        auth: { scheme: "bearer" },
        keyService: "bgg",
        missingKeyMessage: "Missing Board Game API Key",
        storageRule: "as-received",
        rateDisplay: "1/s",
    },
}

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

export function getRefreshAfterDays(name: ProviderName): number | null {
    const rule = getProviderEntry(name).storageRule
    return typeof rule === "object" ? rule["refresh-after-days"] : null
}

/** True when the provider's terms say to store its data exactly as received (no sanitising/rewriting). */
export function isStoredAsReceived(source: string | null | undefined): boolean {
    const name = getStorageProviderForSource(source)
    return name !== null && PROVIDER_REGISTRY[name].storageRule === "as-received"
}
