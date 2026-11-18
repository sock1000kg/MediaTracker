import { z } from "zod"
import { uuidSchema } from "@/schemas/common.js"
import { searchMediaSchema } from "@schemas/mediaSchemas.js"
import { searchLogSchema } from "@/schemas/logSchemas.js"
import { normalizeTypeName, sanitizeDescription } from "@/utilities.js"
import { bookDetailsSchema } from "./bookSchemas.js"
import { albumDetailsSchema, trackDetailsSchema } from "./musicSchemas.js"
import { animeDetailsSchema, mangaDetailsSchema } from "./animeSchemas.js"
import { movieDetailsSchema } from "./movieSchemas.js"
import { gameDetailsSchema } from "./gameSchemas.js"
import { tvSeasonDetailsSchema, tvShowDetailsSchema } from "./tvSchemas.js"
import { boardgameDetailsSchema } from "./bggSchemas.js"

const parentMediaSchema = searchMediaSchema.extend({
    mediaType: z
        .string()
        .transform((val) => normalizeTypeName(val))
        .refine(val => val.trim().length > 0, { message: "Media Type name is required" })
        .optional(),
})

//For when user search up a media and wanna log it
export const createMediaAndLogSchema = z.object({
    mediaData: searchMediaSchema,
    logData: searchLogSchema,
    parent: parentMediaSchema.nullish(),
}).transform((data) => {
    if (data.parent && !data.parent.mediaType) {
        data.parent.mediaType = data.mediaData.mediaType
    }
    if (data.mediaData.source !== "bgg") {
        data.mediaData.description = sanitizeDescription(data.mediaData.description)
    } else {
        data.mediaData.description = data.mediaData.description ? String(data.mediaData.description).trim() || null : null
    }
    if (data.parent) {
        if (data.parent.source !== "bgg") {
            data.parent.description = sanitizeDescription(data.parent.description)
        } else {
            data.parent.description = data.parent.description ? String(data.parent.description).trim() || null : null
        }
    }
    return data
})

const mediaDetailsSchema = z.union([
    albumDetailsSchema.strict(),
    trackDetailsSchema.strict(),
    boardgameDetailsSchema,
    tvSeasonDetailsSchema,
    tvShowDetailsSchema,
    animeDetailsSchema,
    mangaDetailsSchema,
    movieDetailsSchema,
    gameDetailsSchema,
    bookDetailsSchema,
    z.record(z.string(), z.unknown()),
])

export const searchResultCreatorSchema = z.object({
    name: z.string(),
    role: z.string(),
})

//Schema for ONE result of a search (generic normaliztion for all types)
// Search providers stamp the type so clients can log a result as-is
export const SEARCH_MEDIA_TYPES = ["book", "music", "movie", "tv", "game", "anime", "manga", "boardgame"] as const

export const searchResultSchema = z.object({
    mediaType: z.enum(SEARCH_MEDIA_TYPES),
    title: z
        .string()
        .optional()
        .transform(val => val ?? "Unknown title"),
    creator: z
        .string()
        .nullable()
        .default(null),
    creators: z.array(searchResultCreatorSchema).optional(),
    genres: z.array(z.string()).optional(),
    year: z
        .string()
        .nullable()
        .default(null),
    description: z
        .string()
        .nullable()
        .default(null),
    source: z.string(),
    imageUrl:  z
        .string()
        .nullable()
        .default(null),
    sourceId: z.string(),
    inLibrary: z.boolean().optional(),
    myLog: z.object({
        id: uuidSchema,
        rating: z.number().nullable(),
        status: z.string().nullable(),
    }).nullable().optional(),
    details: mediaDetailsSchema.nullable().optional(),
    subtype: z.enum(["album", "track", "show", "season"]).nullable().optional(),
    releaseDate: z.string().nullable().optional(),
    originalTitle: z.string().nullable().optional(),
    externalIds: z.array(z.object({
        provider: z.string(),
        id: z.string(),
    })).optional(),
})
export const searchResultsSchema = z.array(searchResultSchema) //Schema for the results array

export type SearchResult = z.infer<typeof searchResultSchema>