import {
    AniListMedia, AniListMode, AnimeSearchFilters, anilistResponseSchema
} from "@/schemas/search/animeSchemas.js"
import { searchResultsSchema, SearchResult } from "@/schemas/search/searchSchemas.js"
import { validateSchema } from "@/utilities.js"
import { ISearchService } from "./searchServiceInterface.js"
import { AppError } from "@/api/domain/error.js"
import { unexpectedShape } from "./providerErrors.js"
import { anilistLimiter } from "./rateLimiter.js"
import { providerFetch } from "@/providers/providerFetch.js"
import { getProviderEntry } from "@/providers/registry.js"

const ANILIST_ENDPOINT = "https://graphql.anilist.co"
const CONNECTION_ERROR_CODES = new Set(["UND_ERR_CONNECT_TIMEOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ECONNRESET"])

const ANILIST_BY_ID_QUERY = `query ($id: Int) {
  Media(id: $id) {
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
    description(asHtml: false)
    coverImage {
      large
      extraLarge
    }
    siteUrl
    studios(isMain: true) {
      nodes {
        name
      }
    }
    staff(sort: [RELEVANCE]) {
      edges {
        role
        node {
          name {
            full
          }
        }
      }
    }
  }
}`

export const ANILIST_BATCH_MAL_QUERY = `
query ($ids: [Int], $type: MediaType) {
  Page(perPage: 50) {
    media(idMal_in: $ids, type: $type) {
      id
      idMal
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
      coverImage {
        extraLarge
        large
        medium
      }
      description
      format
      siteUrl
    }
  }
}
`

export const ANILIST_BATCH_ID_QUERY = `
query ($ids: [Int], $type: MediaType) {
  Page(perPage: 50) {
    media(id_in: $ids, type: $type) {
      id
      idMal
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
      coverImage {
        extraLarge
        large
        medium
      }
      description
      format
      siteUrl
    }
  }
}
`

export const ANILIST_GRAPHQL_QUERY = `query ($page: Int, $perPage: Int, $search: String, $type: MediaType, $format_in: [MediaFormat], $countryOfOrigin: CountryCode, $sort: [MediaSort]) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      hasNextPage
    }
    media(search: $search, type: $type, format_in: $format_in, countryOfOrigin: $countryOfOrigin, sort: $sort, isAdult: false) {
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
  }
}`

function isConnectionError(error: unknown): boolean {
    let e = error as { code?: string; cause?: unknown } | null | undefined
    for (let depth = 0; e && depth < 3; depth++) {
        if (e.code && CONNECTION_ERROR_CODES.has(e.code)) return true
        e = e.cause as typeof e
    }
    return false
}

export const anilistThrottle = <T>(fn: () => Promise<T>): Promise<T> => anilistLimiter.schedule(fn)

export type AniListVariables = {
    page: number
    perPage: number
    search: string
    type: "ANIME" | "MANGA"
    sort: string[]
    format_in?: string[]
    countryOfOrigin?: string
}

export function buildAniListVariables(
    mode: AniListMode,
    { q, page = 1, type, sort }: { q: string; page?: number } & AnimeSearchFilters
): AniListVariables {
    const variables: AniListVariables = {
        page,
        perPage: 25,
        search: q,
        type: mode === "anime" ? "ANIME" : "MANGA",
        sort: ["SEARCH_MATCH"],
    }

    if (sort) {
        switch (sort) {
            case "score":
                variables.sort = ["SCORE_DESC"]
                break
            case "popularity":
                variables.sort = ["POPULARITY_DESC"]
                break
            case "newest":
                variables.sort = ["START_DATE_DESC"]
                break
            case "relevance":
            default:
                variables.sort = ["SEARCH_MATCH"]
                break
        }
    }

    if (type) {
        if (mode === "anime") {
            switch (type) {
                case "tv":
                    variables.format_in = ["TV", "TV_SHORT"]
                    break
                case "movie":
                    variables.format_in = ["MOVIE"]
                    break
                case "ova":
                    variables.format_in = ["OVA"]
                    break
                case "special":
                    variables.format_in = ["SPECIAL"]
                    break
                case "ona":
                    variables.format_in = ["ONA"]
                    break
                case "music":
                    variables.format_in = ["MUSIC"]
                    break
            }
        } else {
            switch (type) {
                case "manga":
                    variables.format_in = ["MANGA"]
                    break
                case "novel":
                case "lightnovel":
                    variables.format_in = ["NOVEL"]
                    break
                case "oneshot":
                    variables.format_in = ["ONE_SHOT"]
                    break
                case "manhwa":
                    variables.format_in = ["MANGA"]
                    variables.countryOfOrigin = "KR"
                    break
                case "manhua":
                    variables.format_in = ["MANGA"]
                    variables.countryOfOrigin = "CN"
                    break
            }
        }
    }

    return variables
}

const ENTITIES: Record<string, string> = {
    "&amp;": "&",
    "&quot;": '"',
    "&#039;": "'",
    "&apos;": "'",
    "&lt;": "<",
    "&gt;": ">",
}

export function cleanDescription(s: string | null | undefined): string | null {
    if (!s) return null
    let cleaned = s.replace(/<br\s*\/?>/gi, "\n")
    cleaned = cleaned.replace(/<[^>]*>/g, "")
    cleaned = cleaned.replace(/&(?:amp|quot|#039|apos|lt|gt);/g, match => ENTITIES[match] ?? match)
    cleaned = cleaned.replace(/(?:\s*(?:\([^)]*\)|\[[^\]]*\]))+\s*$/, "").trim()
    return cleaned || null
}

export function extractCategories(
    genres: (string | null | undefined)[] | null | undefined,
    tags: { name?: string | null; rank?: number | null; isAdult?: boolean | null; isGeneralSpoiler?: boolean | null; isMediaSpoiler?: boolean | null }[] | null | undefined
): string[] | null {
    const rawList: string[] = []
    for (const g of genres ?? []) {
        if (g && typeof g === "string") {
            const trimmed = g.trim()
            if (trimmed) rawList.push(trimmed)
        }
    }
    for (const t of tags ?? []) {
        if (!t.name || typeof t.name !== "string") continue
        if ((t.rank ?? 0) < 60) continue
        if (t.isAdult || t.isGeneralSpoiler || t.isMediaSpoiler) continue
        const trimmed = t.name.trim()
        if (trimmed) rawList.push(trimmed)
    }

    const seen = new Set<string>()
    const out: string[] = []
    for (const c of rawList) {
        const lower = c.toLowerCase()
        if (seen.has(lower)) continue
        seen.add(lower)
        out.push(c)
        if (out.length === 10) break
    }
    return out.length ? out : null
}

function getHttpsUrl(url: string | null | undefined): string | null {
    if (!url || typeof url !== "string") return null
    const trimmed = url.trim()
    if (trimmed.startsWith("https://")) return trimmed
    return null
}

export function mapAniListMedia(mode: AniListMode, item: AniListMedia): SearchResult {
    const english = item.title?.english?.trim() || null
    const romaji = item.title?.romaji?.trim() || null
    const native = item.title?.native?.trim() || null

    const title = english || romaji || native || undefined
    const originalTitle = (romaji && romaji !== title)
        ? romaji
        : (native && native !== title)
            ? native
            : null

    let creator: string | null = null
    let creators: { name: string; role: string }[] | undefined = undefined
    if (mode === "anime") {
        const studioNames = (item.studios?.nodes ?? [])
            .map(n => n?.name?.trim())
            .filter((n): n is string => Boolean(n))
        creator = studioNames.length ? studioNames.join(", ") : null
        creators = studioNames.length ? studioNames.map(name => ({ name, role: "studio" })) : undefined
    } else {
        const seen = new Set<string>()
        const staffNames: string[] = []
        for (const edge of item.staff?.edges ?? []) {
            if (edge?.role && /story|art|original creator/i.test(edge.role)) {
                const name = edge.node?.name?.full?.trim()
                if (name) {
                    const lower = name.toLowerCase()
                    if (!seen.has(lower)) {
                        seen.add(lower)
                        staffNames.push(name)
                        if (staffNames.length === 3) break
                    }
                }
            }
        }
        creator = staffNames.length ? staffNames.join(", ") : null
        creators = staffNames.length ? staffNames.map(name => ({ name, role: "author" })) : undefined
    }

    const year = item.startDate?.year != null ? String(item.startDate.year) : null
    const categories = extractCategories(item.genres, item.tags)
    const releaseDate = item.startDate?.year != null
        ? `${item.startDate.year}`
        : null

    const details: Record<string, unknown> = {}
    if (item.format) details.format = item.format
    if (typeof item.averageScore === "number") {
        details.score = item.averageScore
        details.scoreScale = "anilist_100"
    }
    if (mode === "anime") {
        if (typeof item.episodes === "number") details.episodeCount = item.episodes
        if (typeof item.duration === "number" && item.duration > 0) details.durationSec = item.duration * 60
    } else {
        if (typeof item.chapters === "number") details.chapterCount = item.chapters
        if (typeof item.volumes === "number") details.volumeCount = item.volumes
    }

    return {
        mediaType: mode,
        title: title as string,
        originalTitle: originalTitle ?? undefined,
        creator,
        creators,
        genres: categories ?? undefined,
        year,
        releaseDate,
        description: cleanDescription(item.description),
        source: "anilist",
        sourceId: `${mode}-${item.id}`,
        imageUrl: getHttpsUrl(item.coverImage?.extraLarge ?? item.coverImage?.large),
        details,
        ...(item.idMal != null ? { externalIds: [{ provider: "mal", id: String(item.idMal) }] } : {}),
    }
}


export class AniListSearchService implements ISearchService {
    async getUserApiKey(): Promise<string | undefined> {
        return undefined
    }

    mapResults(items: AniListMedia[], mode: AniListMode = "anime"): SearchResult[] {
        return items.filter(i => i.id != null).map(i => mapAniListMedia(mode, i))
    }

    async fetchGraphql(query: string, variables: unknown): Promise<unknown> {
        const body = JSON.stringify({ query, variables })
        try {
            const res = await providerFetch("anilist", ANILIST_ENDPOINT, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body,
                allowHttpErrors: true,
            })

            if (res.status === 429) {
                throw new AppError("Anime search is busy right now, try again in a moment", 503)
            }
            const remaining = res.headers.get("X-RateLimit-Remaining")
            if (remaining !== null && Number(remaining) <= 2) {
                anilistLimiter.pause(1000)
            }
            if (!res.ok) {
                throw new AppError("AniList search failed", 502, { cause: `upstream HTTP ${res.status}` })
            }
            const json = await res.json()
            if (json && typeof json === "object" && Array.isArray((json as { errors?: unknown[] }).errors) && (json as { errors: unknown[] }).errors.length > 0) {
                throw new AppError("AniList search failed", 502, { cause: `GraphQL error: ${JSON.stringify((json as { errors: unknown[] }).errors[0])}` })
            }
            return json
        } catch (error) {
            if (error instanceof AppError) throw error
            if (isConnectionError(error)) {
                throw new AppError("AniList can't be reached right now. It may be down; try again later.", 503, { cause: error })
            }
            const name = (error as { name?: string } | null)?.name
            if (name === "TimeoutError" || name === "AbortError") {
                throw new AppError("AniList didn't answer in time. It may be down; try again later.", 504, { cause: error })
            }
            throw new AppError("AniList search failed", 502, { cause: error })
        }
    }

    private async fetchJson(variables: AniListVariables): Promise<unknown> {
        return this.fetchGraphql(ANILIST_GRAPHQL_QUERY, variables)
    }

    // One media by its AniList id. Throws the standard AppError 404 (gone) / 503 (unavailable).
    async getById(id: number, mode: AniListMode = "anime"): Promise<SearchResult> {
        const res = await providerFetch("anilist", ANILIST_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ query: ANILIST_BY_ID_QUERY, variables: { id } }),
            allow404: true,
        })
        if (res.status === 404) throw new AppError("The provider no longer has this item", 404)
        const raw = await res.json().catch(() => null) as { data?: { Media?: AniListMedia } } | null
        const item = raw?.data?.Media
        if (!item) throw new AppError("The provider no longer has this item", 404)
        return mapAniListMedia(mode, item)
    }

    async getByMalIds(ids: number[], mode: AniListMode = "anime"): Promise<Map<number, SearchResult>> {
        const result = new Map<number, SearchResult>()
        if (ids.length === 0) return result

        const batchSize = getProviderEntry("anilist").batchSize ?? 50
        const anilistType = mode === "manga" ? "MANGA" : "ANIME"

        for (let i = 0; i < ids.length; i += batchSize) {
            const batchIds = ids.slice(i, i + batchSize)
            try {
                const json = await this.fetchGraphql(ANILIST_BATCH_MAL_QUERY, { ids: batchIds, type: anilistType })
                const parsed = anilistResponseSchema.safeParse(json)
                if (parsed.success && parsed.data.data?.Page?.media) {
                    for (const m of parsed.data.data.Page.media) {
                        if (m && typeof m.idMal === "number") {
                            const mapped = mapAniListMedia(mode, m as AniListMedia)
                            result.set(m.idMal, mapped)
                        }
                    }
                }
            } catch {
                // If a batch fails, continue with remaining batches
            }
        }
        return result
    }

    async getByAniListIds(ids: number[], mode: AniListMode = "anime"): Promise<Map<number, SearchResult>> {
        const result = new Map<number, SearchResult>()
        if (ids.length === 0) return result

        const batchSize = getProviderEntry("anilist").batchSize ?? 50
        const anilistType = mode === "manga" ? "MANGA" : "ANIME"

        for (let i = 0; i < ids.length; i += batchSize) {
            const batchIds = ids.slice(i, i + batchSize)
            try {
                const json = await this.fetchGraphql(ANILIST_BATCH_ID_QUERY, { ids: batchIds, type: anilistType })
                const parsed = anilistResponseSchema.safeParse(json)
                if (parsed.success && parsed.data.data?.Page?.media) {
                    for (const m of parsed.data.data.Page.media) {
                        if (m && typeof m.id === "number") {
                            const mapped = mapAniListMedia(mode, m as AniListMedia)
                            result.set(m.id, mapped)
                        }
                    }
                }
            } catch {
                // If a batch fails, continue with remaining batches
            }
        }
        return result
    }

    async search(mode: AniListMode, q: string, page = 1, filters: AnimeSearchFilters = {}):
        Promise<{ results: SearchResult[]; nextStartIndex: number | null }>
    {
        const variables = buildAniListVariables(mode, { q, page, ...filters })
        const raw = await this.fetchJson(variables)
        const checked = anilistResponseSchema.safeParse(raw)
        if (!checked.success || !checked.data?.data?.Page) {
            throw new AppError("AniList search failed", 502, { cause: checked.success ? "response has no Page" : unexpectedShape(checked.error) })
        }
        const pageData = checked.data.data.Page
        const mediaList = pageData.media ?? []

        const results = validateSchema(searchResultsSchema, this.mapResults(mediaList, mode))
        return {
            results,
            nextStartIndex: pageData.pageInfo?.hasNextPage ? page + 1 : null,
        }
    }
}

export const anilistSearchService = new AniListSearchService()
