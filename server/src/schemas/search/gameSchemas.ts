import { z } from "zod"

export const gameMetadataSchema = z.object({
    url: z.string().optional(),
    kind: z.literal("game"),
    platforms: z.array(z.string()).nullable().optional(),
    metacritic: z.number().nullable().optional(),
    score: z.number().nullable().optional(), // RAWG rating, 0-5
    publishers: z.array(z.string()).nullable().optional(),
    categories: z.array(z.string()).nullable().optional(),
}).strict()

const nl = <T extends z.ZodTypeAny>(s: T) => s.nullable().optional()

// RAWG /api/games (lenient: unknown keys stripped, everything but `id` may be missing)
export const rawgGameItemSchema = z.object({
    id: nl(z.number()),
    slug: nl(z.string()),
    name: nl(z.string()),
    released: nl(z.string()),
    background_image: nl(z.string()),
    rating: nl(z.number()),
    metacritic: nl(z.number()),
    platforms: nl(z.array(z.object({ platform: nl(z.object({ name: nl(z.string()) })) }))),
    genres: nl(z.array(z.object({ name: nl(z.string()) }))),
    tags: nl(z.array(z.object({ name: nl(z.string()), language: nl(z.string()) }))),
})

export const rawgSearchResponseSchema = z.object({
    count: nl(z.number()),
    next: nl(z.string()),
    results: z.array(rawgGameItemSchema).default([]),
})

// RAWG /api/games/{id}
export const rawgGameDetailsSchema = z.object({
    developers: nl(z.array(z.object({ name: nl(z.string()) }))),
    publishers: nl(z.array(z.object({ name: nl(z.string()) }))),
    description_raw: nl(z.string()),
    website: nl(z.string()),
    genres: nl(z.array(z.object({ name: nl(z.string()) }))),
    tags: nl(z.array(z.object({ name: nl(z.string()), language: nl(z.string()) }))),
})

export type RawgGameItem = z.infer<typeof rawgGameItemSchema>
export type RawgGameDetails = z.infer<typeof rawgGameDetailsSchema>

export const GAME_PLATFORMS = ["pc", "playstation", "xbox", "nintendo", "ios", "android", "mac", "linux"] as const
export const GAME_SORTS = ["relevance", "rating", "newest", "metacritic"] as const
export type GameSearchFilters = {
    platform?: (typeof GAME_PLATFORMS)[number]
    sort?: (typeof GAME_SORTS)[number]
}

const emptyToUndefined = (val: unknown) => (val === "" ? undefined : val)

export const gameSearchQuerySchema = z.object({
    q: z.string("Missing query")
        .trim()
        .min(1, "Missing query")
        .max(100, "Search query must be at most 100 characters"),
    page: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(1)),
    platform: z.preprocess(emptyToUndefined, z.enum(GAME_PLATFORMS, "Invalid platform").optional()),
    sort: z.preprocess(emptyToUndefined, z.enum(GAME_SORTS, "Invalid sort").optional()),
})
