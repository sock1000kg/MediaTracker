import { z } from "zod"
import { LIMITS } from "@/config/limits.js"

export const ANIME_TYPES = ["tv", "movie", "ova", "special", "ona", "music"] as const
export const MANGA_TYPES = ["manga", "novel", "lightnovel", "oneshot", "manhwa", "manhua"] as const
export const ANIME_SORTS = ["relevance", "score", "popularity", "newest"] as const

export type AniListMode = "anime" | "manga"
export type JikanMode = AniListMode

export const animeMetadataSchema = z.object({
    url: z.string().optional(),
    kind: z.enum(["anime", "manga"]),
    format: z.string().nullable().optional(),
    episodes: z.number().nullable().optional(),
    chapters: z.number().nullable().optional(),
    volumes: z.number().nullable().optional(),
    score: z.number().nullable().optional(),
    scoreScale: z.enum(["mal", "anilist"]).optional(),
    originalTitle: z.string().nullable().optional(),
    categories: z.array(z.string()).nullable().optional(),
    episodeMinutes: z.number().nullable().optional(),
    idMal: z.number().nullable().optional(),
    watchedEpisodes: z.number().nullable().optional(),
    readChapters: z.number().nullable().optional(),
    readVolumes: z.number().nullable().optional(),
}).strict()

const nl = <T extends z.ZodTypeAny>(s: T) => s.nullable().optional()

// AniList GraphQL lenient schemas
export const anilistMediaSchema = z.object({
    id: nl(z.number()),
    idMal: nl(z.number()),
    type: nl(z.string()),
    format: nl(z.string()),
    title: nl(z.object({
        romaji: nl(z.string()),
        english: nl(z.string()),
        native: nl(z.string()),
    })),
    episodes: nl(z.number()),
    duration: nl(z.number()),
    chapters: nl(z.number()),
    volumes: nl(z.number()),
    startDate: nl(z.object({
        year: nl(z.number()),
    })),
    averageScore: nl(z.number()),
    genres: nl(z.array(z.string())),
    tags: nl(z.array(z.object({
        name: nl(z.string()),
        rank: nl(z.number()),
        isAdult: nl(z.boolean()),
        isGeneralSpoiler: nl(z.boolean()),
        isMediaSpoiler: nl(z.boolean()),
    }))),
    studios: nl(z.object({
        nodes: nl(z.array(z.object({
            name: nl(z.string()),
        }))),
    })),
    staff: nl(z.object({
        edges: nl(z.array(z.object({
            role: nl(z.string()),
            node: nl(z.object({
                name: nl(z.object({
                    full: nl(z.string()),
                })),
            })),
        }))),
    })),
    coverImage: nl(z.object({
        extraLarge: nl(z.string()),
        large: nl(z.string()),
    })),
    siteUrl: nl(z.string()),
    description: nl(z.string()),
})

export const anilistResponseSchema = z.object({
    data: nl(z.object({
        Page: nl(z.object({
            pageInfo: nl(z.object({
                hasNextPage: nl(z.boolean()),
            })),
            media: nl(z.array(anilistMediaSchema)),
        })),
    })),
    errors: nl(z.array(z.object({
        message: nl(z.string()),
    }))),
})

export type AniListMedia = z.infer<typeof anilistMediaSchema>

// Jikan v4 (kept for backwards compatibility / existing data)
const named = z.array(z.object({ name: nl(z.string()) })).nullable().optional()
const fromYear = z.object({ prop: nl(z.object({ from: nl(z.object({ year: nl(z.number()) })) })) }).nullable().optional()

export const jikanItemSchema = z.object({
    mal_id: nl(z.number()),
    url: nl(z.string()),
    images: nl(z.object({
        jpg: nl(z.object({ image_url: nl(z.string()), large_image_url: nl(z.string()) })),
        webp: nl(z.object({ large_image_url: nl(z.string()) })),
    })),
    title: nl(z.string()),
    title_english: nl(z.string()),
    type: nl(z.string()),
    synopsis: nl(z.string()),
    score: nl(z.number()),
    year: nl(z.number()),
    aired: fromYear,
    published: fromYear,
    duration: nl(z.string()),
    episodes: nl(z.number()),
    chapters: nl(z.number()),
    volumes: nl(z.number()),
    genres: named,
    themes: named,
    demographics: named,
    studios: named,
    authors: named,
})

export const jikanResponseSchema = z.object({
    data: z.array(jikanItemSchema).default([]),
    pagination: nl(z.object({ has_next_page: nl(z.boolean()) })),
})

export type JikanItem = z.infer<typeof jikanItemSchema>

const emptyToUndefined = (val: unknown) => (val === "" ? undefined : val)

const baseQuery = {
    q: z.string("Missing query")
        .trim()
        .min(1, "Missing query")
        .max(LIMITS.search.queryMaxLength, `Search query must be at most ${LIMITS.search.queryMaxLength} characters`),
    page: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(1)),
    sort: z.preprocess(emptyToUndefined, z.enum(ANIME_SORTS).default("relevance")),
}

export const animeSearchQuerySchema = z.object({
    ...baseQuery,
    type: z.preprocess(emptyToUndefined, z.enum(ANIME_TYPES).optional()),
})

export const mangaSearchQuerySchema = z.object({
    ...baseQuery,
    type: z.preprocess(emptyToUndefined, z.enum(MANGA_TYPES).optional()),
})

export type AnimeSearchFilters = { type?: string, sort?: (typeof ANIME_SORTS)[number] }
