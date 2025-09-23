import { z } from "zod"
import { 
    sanitizeTitle, 
    sanitizeCreator, 
    sanitizeMetadata, 
    sanitizeYear, 
    normalizeTypeName,
    sanitizeDescription,
    sanitizeSource,
    sanitizeSourceId,
    sanitizeSourceRating,
    sanitizeRatingsCount,
    sanitizeImageUrl
} from "@/utilities.js"

//Schema for creating and updating medias
const titleSchema = z
    .preprocess((val: string | null | undefined) => {
        return sanitizeTitle(val)
    }, z
    .string({ message: "Title is required" })
)

const mediaTypeSchema = z.object({
    id: z.number(),
    created_at: z.any(),
    userId: z.number(),
    name: z
        .string()
        .transform((val) => normalizeTypeName(val))
        .refine(val => val.trim().length > 0, { message: "Media Type name is required" })
}).loose()

const creatorSchema = z
    .preprocess((val: string | null | undefined) => {
        return sanitizeCreator(val)
    }, z
    .string()
    .nullable() 
    .default(null)
)

const yearSchema = z
    .preprocess((val: string | null | undefined) => {
        return sanitizeYear(val)
    }, z
    .number()
    .int()
    .nullable() 
    .default(null)
)

const descriptionSchema = z
    .preprocess((val: string | null | undefined) => {
        return sanitizeDescription(val)
    }, z
    .string()
    .nullable() 
    .default(null)
)

const sourceSchema = z
    .preprocess((val: string | null | undefined) => {
        return sanitizeSource(val)
    }, z
    .string()
    .nullable() 
    .default(null)
)

const sourceIdSchema = z
    .preprocess((val: string | null | undefined) => {
        return sanitizeSourceId(val)
    }, z
    .string()
    .nullable() 
    .default(null)
)

const sourceRatingSchema = z
    .preprocess((val: string | number | null | undefined) => {
        return sanitizeSourceRating(val)
    }, z
    .number()
    .transform((val) => sanitizeSourceRating(val))
    .nullable() 
    .default(null)
)

const ratingsCount = z
    .preprocess((val: string | number | null | undefined) => {
        return sanitizeRatingsCount(val)
    }, z
    .number()
    .nullable() 
    .default(null)
)

const metadataSchema = z
    .any()
    .transform((val) => sanitizeMetadata(val))
    .nullable() 
    .default(null)

const imageUrl = z
    .preprocess((val: string | null | undefined) => {
        return sanitizeImageUrl(val)
    }, z
    .string()
    .nullable() 
    .default(null)
)

export const createMediaSchema = z.object({
    title: titleSchema,
    mediaType: mediaTypeSchema,
    creator: creatorSchema,
    year: yearSchema,
    description: descriptionSchema,
    source: sourceSchema,
    imageUrl: imageUrl,
    sourceId: sourceIdSchema,
    sourceRating: sourceRatingSchema,
    ratingsCount: ratingsCount,
    metadata: metadataSchema
})


export const updateMediaSchema = z.object({
    title: titleSchema,
    mediaType: mediaTypeSchema,
    creator: creatorSchema,
    year: yearSchema,
    description: descriptionSchema,
    source: sourceSchema,
    imageUrl: imageUrl,
    sourceId: sourceIdSchema,
    sourceRating: sourceRatingSchema,
    ratingsCount: ratingsCount,
    metadata: metadataSchema,
})

// Delete schema with optional confirm flag
export const deleteMediaSchema = z.object({
    confirm: z.boolean()
})

