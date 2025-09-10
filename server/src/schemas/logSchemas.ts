import { z } from "zod"
import {
    sanitizeStatus,
    sanitizeRating,
    sanitizeNotes,
} from "@/utilities"

const allowedStatuses = ["completed", "in progress", "wishlist", "dropped"] as const

// Sanitizers as transforms
const statusSchema = z
    .preprocess((val: string | null | undefined) => {
            return sanitizeStatus(val)
    }, z
    .string()
    .nullable() 
    .default(null)
)

const ratingSchema = z
    .preprocess((val: string | number | null | undefined) => {
            return sanitizeRating(val)
    }, z
    .number()
    .nullable() 
    .default(null)
)

const notesSchema = z
    .preprocess((val: string | null | undefined) => {
            return sanitizeNotes(val)
    }, z
    .string()
    .nullable() 
    .default(null)
)

const mediaIdSchema = z
    .preprocess((val) => {
        // Convert to number if possible
        if (val === undefined || val === null) return val
        const n = Number(val)

        return isNaN(n) ? null : n
    }, z
    .number()
    .int()
)

//for when creating a log of a searched media (no mediaId cus its not in db yet)
export const searchLogSchema = z.object({ 
    status: statusSchema,
    rating: ratingSchema,
    notes: notesSchema,
})

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
