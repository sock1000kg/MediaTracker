import { z } from "zod"
import { searchMediaSchema } from "@schemas/mediaSchemas.js"
import { searchLogSchema } from "@/schemas/logSchemas.js"

//For when user search up a media and wanna log it
export const createMediaAndLogSchema = z.object({
    mediaData: searchMediaSchema,
    logData: searchLogSchema
})

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
    metadata: z.unknown(), // raw Google volumeInfo
})
export const searchResultsSchema = z.array(searchResultSchema) //Schema for the results array

export type SearchResult = z.infer<typeof searchResultSchema>

//BOOKS SEARCH
//For info of each book fetched from GG Books
const bookVolumeInfoSchema = z.object({
    title: z
        .string()
        .optional()
        .transform(val => val ?? "Unknown title"),
    authors: z
        .array(z.string())
        .nullable()
        .default(null),
    publishedDate: z
        .string()
        .nullable()
        .default(null),
    description: z
        .string()
        .nullable()
        .default(null),
    imageLinks: z.object({
        thumbnail: z
            .string()
            .nullable()
            .default(null)
    }).nullable().default(null),
    averageRating: z
        .number()
        .nullable()
        .default(null),
    ratingsCount: z
        .number()
        .nullable()
        .default(null)
}).loose() //allow extra stuff

//For an item of book
const googleBookSchema = z.object({
  id: z.string(),
  volumeInfo: bookVolumeInfoSchema,
})

//For response of a buncha books
export const googleBooksResponseSchema = z.object({
    items: z
        .array(googleBookSchema)
        .nullable()
        .default(null)
})