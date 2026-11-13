import { z } from "zod"

export const movieMetadataSchema = z.object({
    url: z.string().optional(),
    kind: z.literal("movie"),
    originalTitle: z.string().nullable().optional(),
    originalLanguage: z.string().nullable().optional(),
    score: z.number().nullable().optional(),
    runtime: z.number().nullable().optional(),
    categories: z.array(z.string()).nullable().optional(),
    imdbId: z.string().nullable().optional(),
}).strict()

const nl = <T extends z.ZodTypeAny>(s: T) => s.nullable().optional()

// TMDB /3/search/movie (lenient: unknown keys stripped, everything but `id` may be missing)
export const tmdbMovieItemSchema = z.object({
    id: nl(z.number()),
    title: nl(z.string()),
    original_title: nl(z.string()),
    original_language: nl(z.string()),
    release_date: nl(z.string()),
    overview: nl(z.string()),
    poster_path: nl(z.string()),
    genre_ids: nl(z.array(z.number())),
    vote_average: nl(z.number()),
})

export const tmdbSearchResponseSchema = z.object({
    page: nl(z.number()),
    total_pages: nl(z.number()),
    results: z.array(tmdbMovieItemSchema).default([]),
})

// TMDB /3/movie/{id}?append_to_response=credits
export const tmdbMovieDetailsSchema = z.object({
    runtime: nl(z.number()),
    tagline: nl(z.string()),
    imdb_id: nl(z.string()),
    genres: nl(z.array(z.object({ id: nl(z.number()), name: nl(z.string()) }))),
    credits: nl(z.object({
        crew: nl(z.array(z.object({ job: nl(z.string()), name: nl(z.string()) }))),
    })),
})

export type TmdbMovieItem = z.infer<typeof tmdbMovieItemSchema>
export type TmdbMovieDetails = z.infer<typeof tmdbMovieDetailsSchema>

const emptyToUndefined = (val: unknown) => (val === "" ? undefined : val)

export const movieSearchQuerySchema = z.object({
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
