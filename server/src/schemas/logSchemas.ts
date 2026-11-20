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
import { entryInputSchema, entryWithIdSchema, ENTRY_ONLY_KEYS } from "@/schemas/entrySchemas.js"
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

/** A log has no name of its own (entries do): a body carrying `title` is a client bug. */
export function rejectLogTitle(payload: unknown) {
    if (payload && typeof payload === "object" && !Array.isArray(payload) && "title" in payload) {
        throw new AppError("A log has no title; name its entries instead", 400)
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
    status: statusSchema,
    rating: ratingSchema,
    notes: notesSchema,
    tags: tagsSchema,
})

export const createLogSchema = z.object({
    mediaId: mediaIdSchema,
    status: statusSchema,
    rating: ratingSchema,
    notes: notesSchema,
    tags: tagsSchema,
    entry: entryInputSchema.optional(),
})

/** The entries a log save adds, changes and removes together with the log fields. */
export const logEntriesChangeSchema = z.object({
    create: z.array(entryInputSchema).optional(),
    update: z.array(entryWithIdSchema).optional(),
    delete: z.array(uuidSchema).optional(),
}).strict()
export type LogEntriesChange = z.infer<typeof logEntriesChangeSchema>

export const updateLogSchema = z.object({
    status: updateStatusSchema,
    rating: updateRatingSchema,
    notes: updateNotesSchema,
    tags: tagsSchema,
    entries: logEntriesChangeSchema.optional(),
})

// schema for deletion (optional confirm flag)
export const deleteLogSchema = z.object({
    confirm: z.boolean()
})
