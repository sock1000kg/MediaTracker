import { z } from "zod"

export const scoreScaleSchema = z.enum(["tmdb_10", "anilist_100", "mal_10", "rawg_5", "bgg_10"])
export type ScoreScale = z.infer<typeof scoreScaleSchema>

export const bookDetailsSchema = z.object({
    pageCount: z.number().int().nonnegative().nullish(),
    publisher: z.string().nullish(),
}).strict()
export type BookDetails = z.infer<typeof bookDetailsSchema>

export const albumDetailsSchema = z.object({
    format: z.string().nullish(),
    formatTags: z.array(z.string()).nullish(),
}).strict()
export type AlbumDetails = z.infer<typeof albumDetailsSchema>

export const trackDetailsSchema = z.object({
    durationSec: z.number().int().nonnegative().nullish(),
}).strict()
export type TrackDetails = z.infer<typeof trackDetailsSchema>

export const movieDetailsSchema = z.object({
    durationSec: z.number().int().nonnegative().nullish(),
    language: z.string().nullish(),
    score: z.number().nullish(),
    scoreScale: scoreScaleSchema.nullish(),
}).strict()
export type MovieDetails = z.infer<typeof movieDetailsSchema>

export const showDetailsSchema = z.object({
    seasonCount: z.number().int().nonnegative().nullish(),
    episodeCount: z.number().int().nonnegative().nullish(),
    networks: z.array(z.string()).nullish(),
    country: z.union([z.string(), z.array(z.string())]).nullish(),
    airingStatus: z.string().nullish(),
    language: z.string().nullish(),
    score: z.number().nullish(),
    scoreScale: scoreScaleSchema.nullish(),
}).strict()
export type ShowDetails = z.infer<typeof showDetailsSchema>

export const seasonDetailsSchema = z.object({
    episodeCount: z.number().int().nonnegative().nullish(),
}).strict()
export type SeasonDetails = z.infer<typeof seasonDetailsSchema>

export const animeDetailsSchema = z.object({
    format: z.string().nullish(),
    episodeCount: z.number().int().nonnegative().nullish(),
    durationSec: z.number().int().nonnegative().nullish(),
    score: z.number().nullish(),
    scoreScale: scoreScaleSchema.nullish(),
}).strict()
export type AnimeDetails = z.infer<typeof animeDetailsSchema>

export const mangaDetailsSchema = z.object({
    format: z.string().nullish(),
    chapterCount: z.number().int().nonnegative().nullish(),
    volumeCount: z.number().int().nonnegative().nullish(),
    score: z.number().nullish(),
    scoreScale: scoreScaleSchema.nullish(),
}).strict()
export type MangaDetails = z.infer<typeof mangaDetailsSchema>

export const gameDetailsSchema = z.object({
    platforms: z.array(z.string()).nullish(),
    publishers: z.array(z.string()).nullish(),
    score: z.number().nullish(),
    scoreScale: scoreScaleSchema.nullish(),
    metacritic: z.number().int().nullish(),
    avgPlaytimeHours: z.number().nullish(),
}).strict()
export type GameDetails = z.infer<typeof gameDetailsSchema>

export const boardgameDetailsSchema = z.object({
    minPlayers: z.number().int().nullish(),
    maxPlayers: z.number().int().nullish(),
    playTimeMin: z.number().int().nullish(),
    minPlayTimeMin: z.number().int().nullish(),
    maxPlayTimeMin: z.number().int().nullish(),
    score: z.number().nullish(),
    scoreScale: scoreScaleSchema.nullish(),
}).strict()
export type BoardgameDetails = z.infer<typeof boardgameDetailsSchema>

export const customDetailsSchema = z.object({
    durationSec: z.number().int().nonnegative().nullish(),
    edition: z.string().nullish(),
    language: z.string().nullish(),
    pageCount: z.number().int().nonnegative().nullish(),
    url: z.string().nullish(),
}).strict()
export type CustomDetails = z.infer<typeof customDetailsSchema>

export type DetailsType =
    | BookDetails
    | AlbumDetails
    | TrackDetails
    | MovieDetails
    | ShowDetails
    | SeasonDetails
    | AnimeDetails
    | MangaDetails
    | GameDetails
    | BoardgameDetails
    | CustomDetails

export function getSchemaForSubtypeOrType(options: {
    subtype?: string | null
    mediaTypeName?: string | null
    hasProvider?: boolean
}): z.ZodTypeAny {
    if (options.hasProvider === false) {
        return customDetailsSchema
    }

    const subtype = options.subtype?.toLowerCase()
    if (subtype === "album") return albumDetailsSchema
    if (subtype === "track") return trackDetailsSchema
    if (subtype === "show") return showDetailsSchema
    if (subtype === "season") return seasonDetailsSchema

    const type = options.mediaTypeName?.toLowerCase()
    switch (type) {
        case "book":
            return bookDetailsSchema
        case "movie":
            return movieDetailsSchema
        case "tv":
            return showDetailsSchema
        case "anime":
            return animeDetailsSchema
        case "manga":
            return mangaDetailsSchema
        case "game":
            return gameDetailsSchema
        case "boardgame":
            return boardgameDetailsSchema
        default:
            return customDetailsSchema
    }
}

export function validateDetails(
    rawDetails: unknown,
    options: {
        subtype?: string | null
        mediaTypeName?: string | null
        hasProvider?: boolean
    }
): Record<string, unknown> | null {
    if (rawDetails === undefined || rawDetails === null) {
        return null
    }
    const schema = getSchemaForSubtypeOrType(options)
    return schema.parse(rawDetails) as Record<string, unknown>
}
