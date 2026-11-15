import {
    AniListMedia, AniListMode, AnimeSearchFilters, anilistResponseSchema
} from "@/schemas/search/animeSchemas.js"
import { searchResultsSchema, SearchResult } from "@/schemas/search/searchSchemas.js"
import { createThrottle, createUserAgentHeader, validateSchema } from "@/utilities.js"
import { ISearchService } from "./searchServiceInterface.js"
import { AppError } from "@/api/domain/error.js"

const ANILIST_ENDPOINT = "https://graphql.anilist.co"
const MIN_GAP_MS = 700 // AniList allows ~90 requests/min
const DEFAULT_RETRY_MS = 1000
const MAX_RETRY_MS = 3000
const TIMEOUT_MS = 8000
const CONNECTION_ERROR_CODES = new Set(["UND_ERR_CONNECT_TIMEOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ECONNRESET"])

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

export const anilistThrottle = createThrottle(MIN_GAP_MS)

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

    return {
        mediaType: mode,
        title: title as string,
        creator,
        creators,
        year,
        description: cleanDescription(item.description),
        source: "anilist",
        sourceId: `${mode}-${item.id}`,
        imageUrl: getHttpsUrl(item.coverImage?.extraLarge ?? item.coverImage?.large),
        metadata: {
            ...(item.siteUrl ? { url: item.siteUrl } : {}),
            kind: mode,
            format: item.format ?? null,
            ...(mode === "anime"
                ? {
                    episodes: item.episodes ?? null,
                    episodeMinutes: typeof item.duration === "number" && item.duration > 0 ? item.duration : null,
                }
                : {
                    chapters: item.chapters ?? null,
                    volumes: item.volumes ?? null,
                }),
            score: typeof item.averageScore === "number" ? item.averageScore : null,
            scoreScale: "anilist",
            originalTitle,
            categories,
            idMal: item.idMal ?? null,
        },
        ...(item.idMal != null ? { externalIds: [{ provider: "mal", id: String(item.idMal) }] } : {}),
    }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function retryDelayMs(res: Response): number {
    const secs = Number(res.headers.get("Retry-After"))
    const ms = Number.isFinite(secs) && secs > 0 ? secs * 1000 : DEFAULT_RETRY_MS
    return Math.min(ms, MAX_RETRY_MS)
}

export class AniListSearchService implements ISearchService {
    async getUserApiKey(): Promise<string | undefined> {
        return undefined
    }

    mapResults(items: AniListMedia[], mode: AniListMode = "anime"): SearchResult[] {
        return items.filter(i => i.id != null).map(i => mapAniListMedia(mode, i))
    }

    private async fetchJson(variables: AniListVariables): Promise<unknown> {
        const body = JSON.stringify({ query: ANILIST_GRAPHQL_QUERY, variables })
        const send = () => anilistThrottle(() =>
            fetch(ANILIST_ENDPOINT, {
                method: "POST",
                headers: {
                    ...(createUserAgentHeader().headers as Record<string, string>),
                    "Content-Type": "application/json",
                },
                body,
                signal: AbortSignal.timeout(TIMEOUT_MS),
            })
        )

        try {
            let res = await send()
            if (res.status === 429) {
                await sleep(retryDelayMs(res))
                res = await send()
                if (res.status === 429) {
                    throw new AppError("Anime search is busy right now, try again in a moment", 503)
                }
            }
            if (!res.ok) {
                throw new AppError("AniList search failed", 502)
            }
            const json = await res.json()
            if (json && typeof json === "object" && Array.isArray((json as { errors?: unknown[] }).errors) && (json as { errors: unknown[] }).errors.length > 0) {
                throw new AppError("AniList search failed", 502)
            }
            return json
        } catch (error) {
            if (error instanceof AppError) throw error
            if (isConnectionError(error)) {
                throw new AppError("AniList can't be reached right now. It may be down; try again later.", 503)
            }
            const name = (error as { name?: string } | null)?.name
            if (name === "TimeoutError" || name === "AbortError") {
                throw new AppError("AniList didn't answer in time. It may be down; try again later.", 504)
            }
            throw new AppError("AniList search failed", 502)
        }
    }

    async search(mode: AniListMode, q: string, page = 1, filters: AnimeSearchFilters = {}):
        Promise<{ results: SearchResult[]; nextStartIndex: number | null }>
    {
        const variables = buildAniListVariables(mode, { q, page, ...filters })
        const raw = await this.fetchJson(variables)
        const checked = anilistResponseSchema.safeParse(raw)
        if (!checked.success || !checked.data?.data?.Page) {
            throw new AppError("AniList search failed", 502)
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
