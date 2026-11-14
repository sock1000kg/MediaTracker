import { z } from "zod"

const nl = <T extends z.ZodTypeAny>(s: T) => s.nullable().optional()

export const tvShowMetadataSchema = z.object({
    url: z.string().optional(),
    kind: z.literal("show"),
    tmdbId: z.number(),
    originalTitle: z.string().nullable().optional(),
    firstAirDate: z.string().nullable().optional(),
    genres: z.array(z.string()).nullable().optional(),
    originCountry: z.union([z.array(z.string()), z.string()]).nullable().optional(),
    seasonCount: z.number().nullable().optional(),
    episodeCount: z.number().nullable().optional(),
    status: z.string().nullable().optional(),
    networks: z.array(z.string()).nullable().optional(),
    creator: z.string().nullable().optional(),
}).strict()

export const tvSeasonMetadataSchema = z.object({
    url: z.string().optional(),
    kind: z.literal("season"),
    tmdbId: z.number(),
    showTitle: z.string(),
    seasonNumber: z.number(),
    episodeCount: z.number().nullable().optional(),
    airDate: z.string().nullable().optional(),
    networks: z.array(z.string()).nullable().optional(),
    genres: z.array(z.string()).nullable().optional(),
}).strict()

// TMDB /3/search/tv
export const tmdbTvItemSchema = z.object({
    id: nl(z.number()),
    name: nl(z.string()),
    original_name: nl(z.string()),
    first_air_date: nl(z.string()),
    overview: nl(z.string()),
    poster_path: nl(z.string()),
    genre_ids: nl(z.array(z.number())),
    origin_country: nl(z.array(z.string())),
    vote_average: nl(z.number()),
})

export const tmdbTvSearchResponseSchema = z.object({
    page: nl(z.number()),
    total_pages: nl(z.number()),
    results: z.array(tmdbTvItemSchema).default([]),
})

// TMDB /3/tv/{id}
export const tmdbTvSeasonItemSchema = z.object({
    id: nl(z.number()),
    name: nl(z.string()),
    season_number: nl(z.number()),
    episode_count: nl(z.number()),
    air_date: nl(z.string()),
    overview: nl(z.string()),
    poster_path: nl(z.string()),
})

export const tmdbTvShowDetailsSchema = z.object({
    id: nl(z.number()),
    name: nl(z.string()),
    original_name: nl(z.string()),
    first_air_date: nl(z.string()),
    overview: nl(z.string()),
    poster_path: nl(z.string()),
    number_of_seasons: nl(z.number()),
    number_of_episodes: nl(z.number()),
    status: nl(z.string()),
    networks: nl(z.array(z.object({ name: nl(z.string()) }))),
    created_by: nl(z.array(z.object({ name: nl(z.string()) }))),
    genres: nl(z.array(z.object({ id: nl(z.number()), name: nl(z.string()) }))),
    origin_country: nl(z.array(z.string())),
    seasons: nl(z.array(tmdbTvSeasonItemSchema)),
})

export type TmdbTvItem = z.infer<typeof tmdbTvItemSchema>
export type TmdbTvShowDetails = z.infer<typeof tmdbTvShowDetailsSchema>

const emptyToUndefined = (val: unknown) => (val === "" ? undefined : val)

export const tvSearchQuerySchema = z.object({
    q: z.string("Missing query")
        .trim()
        .min(1, "Missing query")
        .max(100, "Search query must be at most 100 characters"),
    page: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(1)),
    year: z.preprocess(
        emptyToUndefined,
        z.coerce.number("Invalid year").int("Invalid year")
            .min(1874, "Invalid year")
            .max(new Date().getFullYear() + 5, "Invalid year")
            .optional()
    ),
})
