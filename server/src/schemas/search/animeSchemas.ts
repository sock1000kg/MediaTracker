import { z } from "zod"
import { LIMITS } from "@/config/limits.js"

export const ANIME_TYPES = ["tv", "movie", "ova", "special", "ona", "music"] as const
export const MANGA_TYPES = ["manga", "novel", "lightnovel", "oneshot", "manhwa", "manhua"] as const
export const ANIME_SORTS = ["relevance", "score", "popularity", "newest"] as const

export type AniListMode = "anime" | "manga"

export const animeDetailsSchema = z.object({
    format: z.string().nullable().optional(),
    episodeCount: z.number().nullable().optional(),
    durationSec: z.number().nullable().optional(),
    country: z.string().nullable().optional(),
    airingStatus: z.string().nullable().optional(),
    language: z.string().nullable().optional(),
    score: z.number().nullable().optional(),
    scoreScale: z.literal("anilist_100").optional(),
}).strict()

export const mangaDetailsSchema = z.object({
    format: z.string().nullable().optional(),
    chapterCount: z.number().nullable().optional(),
    volumeCount: z.number().nullable().optional(),
    country: z.string().nullable().optional(),
    publishingStatus: z.string().nullable().optional(),
    score: z.number().nullable().optional(),
    scoreScale: z.literal("anilist_100").optional(),
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
