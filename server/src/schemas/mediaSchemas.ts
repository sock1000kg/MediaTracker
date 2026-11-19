import { toIdSource } from "@/db.js"
import { z } from "zod"
import { uuidSchema } from "@/schemas/common.js"
import { 
    sanitizeTitle, 
    sanitizeCreator, 
    sanitizeDetails, 
    sanitizeYear, 
    normalizeTypeName,
    sanitizeDescription,
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

const searchSourceSchema = z
    .preprocess((val: string | null | undefined) => {
        return toIdSource(val)
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

const detailsSchema = z
    .any()
    .transform((val) => sanitizeDetails(val))
    .nullable() 
    .default(null)

const subtypeSchema = z
    .preprocess((val: unknown) => {
        if (typeof val === "string") {
            const s = val.trim().toLowerCase()
            if (["album", "track", "show", "season"].includes(s)) return s
        }
        return null
    }, z.enum(["album", "track", "show", "season"]).nullable().default(null))

const releaseDateSchema = z
    .preprocess((val: unknown) => {
        if (!val) return null
        if (val instanceof Date) return val
        if (typeof val === "string" || typeof val === "number") {
            const d = new Date(val)
            if (!Number.isNaN(d.getTime())) return d
        }
        return null
    }, z.date().nullable().default(null))

const imageUrl = z
    .preprocess((val: string | null | undefined) => {
        return sanitizeImageUrl(val)
    }, z
    .string()
    .nullable() 
    .default(null)
)

const customMediaProviderSchema = z
    .preprocess((val: unknown) => {
        if (val === undefined || val === null || val === "") return null
        return val
    }, z.null({ message: "Custom media can't have a provider" }))

export const createMediaSchema = z.object({
    title: titleSchema,
    mediaType: mediaTypeSchema,
    creator: creatorSchema,
    year: yearSchema,
    description: z.string().nullable().default(null),
    provider: customMediaProviderSchema.optional(),
    providerId: z.string().nullable().optional().default(null),
    source: customMediaProviderSchema.optional(),
    sourceId: z.string().nullable().optional().default(null),
    imageUrl: imageUrl,
    details: detailsSchema.optional(),
    subtype: subtypeSchema.optional(),
    releaseDate: releaseDateSchema.optional(),
    syncedAt: z.date().nullable().optional(),
    syncCheckedAt: z.date().nullable().optional(),
    externalIds: z.array(z.object({
        provider: z.string(),
        id: z.string().optional(),
        externalId: z.string().optional(),
    })).optional(),
}).transform((data) => {
    data.description = sanitizeDescription(data.description)
    return {
        ...data,
        details: data.details ?? null,
        provider: null,
        providerId: null,
        source: null,
        sourceId: null,
    }
})

export const updateMediaSchema = z.object({
    title: titleSchema,
    mediaType: mediaTypeSchema,
    creator: creatorSchema,
    year: yearSchema,
    description: z.string().nullable().default(null),
    provider: customMediaProviderSchema.optional(),
    providerId: z.string().nullable().optional().default(null),
    source: customMediaProviderSchema.optional(),
    sourceId: z.string().nullable().optional().default(null),
    imageUrl: imageUrl,
    details: detailsSchema.optional(),
    subtype: subtypeSchema.optional(),
    releaseDate: releaseDateSchema.optional(),
    syncedAt: z.date().nullable().optional(),
    syncCheckedAt: z.date().nullable().optional(),
    externalIds: z.array(z.object({
        provider: z.string(),
        id: z.string().optional(),
        externalId: z.string().optional(),
    })).optional(),
}).transform((data) => {
    data.description = sanitizeDescription(data.description)
    return {
        ...data,
        details: data.details ?? null,
        provider: null,
        providerId: null,
        source: null,
        sourceId: null,
    }
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
    provider: searchSourceSchema.optional(),
    imageUrl: imageUrl,
    sourceId: sourceIdSchema,
    providerId: sourceIdSchema.optional(),
    details: detailsSchema.optional(),
    subtype: subtypeSchema.optional(),
    releaseDate: releaseDateSchema.optional(),
    syncedAt: z.date().nullable().optional(),
    syncCheckedAt: z.date().nullable().optional(),
    externalIds: z.array(z.object({
        provider: z.string(),
        id: z.string().optional(),
        externalId: z.string().optional(),
    })).optional(),
})