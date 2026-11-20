import { z } from "zod"
import { uuidSchema } from "@/schemas/common.js"
import {
    sanitizeStatus,
    sanitizeRating,
    sanitizeNotes,
    MAX_NOTES_LENGTH,
    allowedStatuses,
    AllowedStatus,
    normalizeTagName,
    tagKey,
    MAX_TAGS_PER_LOG,
} from "@/utilities.js"
import { LIMITS } from "@/config/limits.js"
import { entryInputSchema, ENTRY_ONLY_KEYS } from "@/schemas/entrySchemas.js"
import { AppError } from "@/api/domain/error.js"

/** Dates and progress live on entries; a log body carrying them is a client bug, not something to drop silently. */
export function rejectEntryKeys(payload: unknown) {
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        const body = payload as Record<string, unknown>
        if (ENTRY_ONLY_KEYS.some(k => body[k] !== undefined)) {
            throw new AppError("Dates belong to an entry", 400)
        }
    }
}

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

// Update schemas:
// - val === undefined: return undefined (preserves existing field)
// - val === null or "": return null (explicit clear)
// - invalid input: return undefined (ignored, preserves existing field)
// - valid input: return validated/sanitized value
const updateStatusSchema = z.preprocess((val: unknown) => {
    if (val === undefined) return undefined
    if (val === null || val === "") return null
    if (typeof val === "string") {
        const cleaned = val.trim().toLowerCase()
        if (allowedStatuses.includes(cleaned as AllowedStatus)) {
            return cleaned as AllowedStatus
        }
    }
    return undefined
}, z.string().nullable().optional())

const updateRatingSchema = z.preprocess((val: unknown) => {
    if (val === undefined) return undefined
    if (val === null || val === "") return null
    const num = Number(val)
    if (isNaN(num) || num < 0 || num > 100) return undefined
    return num
}, z.number().nullable().optional())

const updateNotesSchema = z.preprocess((val: unknown) => {
    if (val === undefined) return undefined
    if (val === null || val === "") return null
    return String(val).trim().slice(0, MAX_NOTES_LENGTH)
}, z.string().nullable().optional())

const mediaIdSchema = uuidSchema

const titleSchema = z.preprocess((val: unknown) => {
    if (val === undefined) return undefined
    if (val === null) return null
    if (typeof val !== "string") return val
    const trimmed = val.trim()
    return trimmed === "" ? null : trimmed
}, z.string().max(LIMITS.logs.titleMaxLength, `Name can't exceed ${LIMITS.logs.titleMaxLength} characters`).nullable().optional())

export const tagsSchema = z.array(z.string()).superRefine((items, ctx) => {
    for (let i = 0; i < items.length; i++) {
        const norm = normalizeTagName(items[i])
        if (!norm) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Invalid tag name: must be 1-40 characters without commas",
                path: [i],
            })
            return
        }
    }
}).transform((items) => {
    const seen = new Set<string>()
    const collapsed: string[] = []
    for (const raw of items) {
        const norm = normalizeTagName(raw)!
        const key = tagKey(norm)
        if (!seen.has(key)) {
            seen.add(key)
            collapsed.push(norm)
        }
    }
    return collapsed
}).superRefine((collapsed, ctx) => {
    if (collapsed.length > MAX_TAGS_PER_LOG) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Cannot exceed 20 tags per log",
        })
    }
}).optional()

//for when creating a log of a searched media (no mediaId cus its not in db yet)
export const searchLogSchema = z.object({
    title: titleSchema,
    status: statusSchema,
    rating: ratingSchema,
    notes: notesSchema,
    tags: tagsSchema,
})

export const createLogSchema = z.object({
    mediaId: mediaIdSchema,
    title: titleSchema,
    status: statusSchema,
    rating: ratingSchema,
    notes: notesSchema,
    tags: tagsSchema,
    entry: entryInputSchema.optional(),
})

export const updateLogSchema = z.object({
    title: titleSchema,
    status: updateStatusSchema,
    rating: updateRatingSchema,
    notes: updateNotesSchema,
    tags: tagsSchema,
})

// schema for deletion (optional confirm flag)
export const deleteLogSchema = z.object({
    confirm: z.boolean()
})
