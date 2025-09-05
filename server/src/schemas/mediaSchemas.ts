import { z } from "zod"
import { 
  sanitizeTitle, 
  sanitizeCreator, 
  sanitizeMetadata, 
  sanitizeYear, 
  normalizeTypeName
} from "@/utilities"

// Create media schema
const titleSchema = z
    .string()
    .transform((val) => sanitizeTitle(val) ?? "")
    .refine(val => val.trim().length > 0, { message: "Title is required" })

const mediaTypeSchema = z.object({
    name: z
        .string()
        .transform((val) => normalizeTypeName(val))
        .refine(val => val.trim().length > 0, { message: "Media Type name is required" })
})

const creatorSchema = z
    .string()
    .transform((val) => sanitizeCreator(val))
    .nullable() 
    .default(null)

const yearSchema = z
    .number()
    .int()
    .transform((val) => sanitizeYear(val))
    .nullable() 
    .default(null)

const metadataSchema = z
    .any()
    .transform((val) => sanitizeMetadata(val))
    .nullable() 
    .default(null)

export const createMediaSchema = z.object({
    title: titleSchema,
    mediaType: mediaTypeSchema,
    creator: creatorSchema,
    year: yearSchema,
    metadata: metadataSchema
})

// Update media schema
export const updateMediaSchema = z.object({
    title: titleSchema,
    mediaType: mediaTypeSchema,
    creator: creatorSchema,
    year: yearSchema,
    metadata: metadataSchema
})

// Delete schema with optional confirm flag
export const deleteMediaSchema = z.object({
    confirm: z.boolean().optional()
})

export type CreateMediaInput = z.infer<typeof createMediaSchema>
export type UpdateMediaInput = z.infer<typeof updateMediaSchema>
export type DeleteMediaInput = z.infer<typeof deleteMediaSchema>
