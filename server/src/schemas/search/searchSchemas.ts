import { z } from "zod"
import { searchMediaSchema } from "@schemas/mediaSchemas.js"
import { searchLogSchema } from "@/schemas/logSchemas.js"
import { bookMetadataSchema } from "./bookSchemas.js"
import { musicMetadataSchema } from "./musicSchemas.js"
import { animeMetadataSchema } from "./animeSchemas.js"
import { movieMetadataSchema } from "./movieSchemas.js"
import { gameMetadataSchema } from "./gameSchemas.js"

//For when user search up a media and wanna log it
export const createMediaAndLogSchema = z.object({
    mediaData: searchMediaSchema,
    logData: searchLogSchema
})

// Music goes first and is strict: the book schema would otherwise match music results and strip `kind`
const mediaMetadataSchema = z.union([
  musicMetadataSchema.strict(),
  animeMetadataSchema,
  movieMetadataSchema,
  gameMetadataSchema,
  bookMetadataSchema
])

//Schema for ONE result of a search (generic normaliztion for all types)
export const searchResultSchema = z.object({
    title: z
        .string()
        .optional()
        .transform(val => val ?? "Unknown title"),
    creator: z
        .string()
        .nullable()
        .default(null),
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
    metadata: mediaMetadataSchema.optional(), // raw Google volumeInfo
})
export const searchResultsSchema = z.array(searchResultSchema) //Schema for the results array

export type SearchResult = z.infer<typeof searchResultSchema>