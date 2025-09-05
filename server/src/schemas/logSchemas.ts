import { z } from "zod"
import {
    sanitizeStatus,
    sanitizeRating,
    sanitizeNotes,
} from "@/utilities"

const allowedStatuses = ["completed", "in progress", "wishlist", "dropped"] as const

// Sanitizers as transforms
const statusSchema = z
    .string()
    .transform((val) => sanitizeStatus(val))
    .nullable() 
    .default(null)

const ratingSchema = z
    .number()
    .transform((val) => sanitizeRating(val))
    .nullable() 
    .default(null)

const notesSchema = z
    .string()
    .transform((val) => sanitizeNotes(val))
    .nullable() 
    .default(null)

const mediaIdSchema = z.preprocess(
    (val) => {
        // Convert to number if possible
        if (val === undefined || val === null) return val
        const n = Number(val)

        return isNaN(n) ? null : n
    },
    z.number().int()
)

export const createLogSchema = z.object({
    mediaId: mediaIdSchema,
    status: statusSchema,
    rating: ratingSchema,
    notes: notesSchema,
})

export const updateLogSchema = z.object({
    status: statusSchema,
    rating: ratingSchema,
    notes: notesSchema,
})

// schema for deletion (optional confirm flag)
export const deleteLogSchema = z.object({
    confirm: z.boolean().optional(),
})

export type CreateLogInput = z.infer<typeof createLogSchema>
export type UpdateLogInput = z.infer<typeof updateLogSchema>
