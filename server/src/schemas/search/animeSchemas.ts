import { z } from "zod"

export const ANIME_TYPES = ["tv", "movie", "ova", "special", "ona", "music"] as const
export const MANGA_TYPES = ["manga", "novel", "lightnovel", "oneshot", "manhwa", "manhua"] as const
export const ANIME_SORTS = ["relevance", "score", "popularity", "newest"] as const

export type JikanMode = "anime" | "manga"

export const animeMetadataSchema = z.object({
    url: z.string().optional(),
    kind: z.enum(["anime", "manga"]),
    format: z.string().nullable().optional(),
    episodes: z.number().nullable().optional(),
    chapters: z.number().nullable().optional(),
    volumes: z.number().nullable().optional(),
    score: z.number().nullable().optional(),
    originalTitle: z.string().nullable().optional(),
    categories: z.array(z.string()).nullable().optional(),
}).strict()

// Jikan v4 (lenient: every field we read is nullable + optional, unknown keys are stripped)
const nl = <T extends z.ZodTypeAny>(s: T) => s.nullable().optional()
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
        .max(100, "Search query must be at most 100 characters"),
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
