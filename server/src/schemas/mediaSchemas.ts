import { z } from "zod"
import { uuidSchema } from "@/schemas/common.js"
import { 
    sanitizeTitle, 
    sanitizeCreator, 
    sanitizeMetadata, 
    sanitizeYear, 
    normalizeTypeName,
    sanitizeDescription,
    sanitizeSource,
    sanitizeSourceId,
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
    id: uuidSchema,
    created_at: z.any(),
    name: z
        .string()
        .transform((val) => normalizeTypeName(val))
        .refine(val => val.trim().length > 0, { message: "Media Type name is required" })
}, { message: "Media Type is required" })

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

const sourceSchema = z
    .preprocess((val: string | null | undefined) => {
        return sanitizeSource(val)
    }, z
    .string()
    .nullable() 
    .default(null)
)

const searchSourceSchema = z
    .preprocess((val: string | null | undefined) => {
        return sanitizeSource(val)
    }, z
    .string()
)

const sourceIdSchema = z
    .preprocess((val: string | null | undefined) => {
        return sanitizeSourceId(val)
    }, z
    .string()
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
    description: z.string().nullable().default(null),
    source: sourceSchema,
    imageUrl: imageUrl,
    sourceId: sourceIdSchema,
    metadata: metadataSchema
}).transform((data) => {
    if (data.source !== "bgg") {
        data.description = sanitizeDescription(data.description)
    } else {
        data.description = data.description ? String(data.description).trim() || null : null
    }
    return data
})

export const updateMediaSchema = z.object({
    title: titleSchema,
    mediaType: mediaTypeSchema,
    creator: creatorSchema,
    year: yearSchema,
    description: z.string().nullable().default(null),
    source: sourceSchema,
    imageUrl: imageUrl,
    sourceId: sourceIdSchema,
    metadata: metadataSchema,
}).transform((data) => {
    if (data.source !== "bgg") {
        data.description = sanitizeDescription(data.description)
    } else {
        data.description = data.description ? String(data.description).trim() || null : null
    }
    return data
})

// Delete schema with optional confirm flag
export const deleteMediaSchema = z.object({
    confirm: z.boolean()
})

// Create schema specifically for searched up medias (due to missing info)
export const searchMediaSchema = z.object({ 
    title: titleSchema,
    mediaType: z
        .string({ message: "Media Type is required" })
        .transform((val) => normalizeTypeName(val))
        .refine(val => val.trim().length > 0, { message: "Media Type name is required" }),
    creator: creatorSchema,
    creators: z.array(z.object({ name: z.string(), role: z.string() })).optional(),
    genres: z.array(z.string()).optional(),
    year: yearSchema,
    description: z.string().nullable().default(null),
    source: searchSourceSchema,
    imageUrl: imageUrl,
    sourceId: sourceIdSchema,
    metadata: metadataSchema
})