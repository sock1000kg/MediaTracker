import { z } from "zod"
import {
    sanitizeStatus,
    sanitizeRating,
    sanitizeNotes,
    toDayPrecision,
    normalizeTagName,
    tagKey,
    MAX_TAGS_PER_LOG,
} from "@/utilities.js"

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

// Day-precision date schema: noon UTC of calendar day, or null, or undefined
const dateInputSchema = z.preprocess((val: unknown) => {
    if (val === undefined) return undefined
    if (val === null || val === "") return null
    const d = toDayPrecision(val)
    return d ?? "invalid"
}, z.union([z.date(), z.null(), z.undefined()]))

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

function validateLogDateConstraints(
    data: { startedAt?: Date | null; finishedAt?: Date | null },
    ctx: z.RefinementCtx
) {
    const now = new Date()
    // Neither more than 1 day in the future (allow up to tomorrow noon UTC for timezone differences)
    const maxFuture = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 12, 0, 0, 0))

    if (data.startedAt && data.startedAt.getTime() > maxFuture.getTime()) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Date cannot be more than 1 day in the future",
            path: ["startedAt"]
        })
    }
    if (data.finishedAt && data.finishedAt.getTime() > maxFuture.getTime()) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Date cannot be more than 1 day in the future",
            path: ["finishedAt"]
        })
    }
    if (data.startedAt && data.finishedAt && data.finishedAt.getTime() < data.startedAt.getTime()) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Finished date can't be before the start date",
            path: ["finishedAt"]
        })
    }
}

const normalizeDateKeys = (val: unknown) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
        const obj = { ...(val as Record<string, unknown>) }
        if (obj.started_at !== undefined && obj.startedAt === undefined) {
            obj.startedAt = obj.started_at
        }
        if (obj.finished_at !== undefined && obj.finishedAt === undefined) {
            obj.finishedAt = obj.finished_at
        }
        return obj
    }
    return val
}

//for when creating a log of a searched media (no mediaId cus its not in db yet)
export const searchLogSchema = z.preprocess(
    normalizeDateKeys,
    z.object({ 
        status: statusSchema,
        rating: ratingSchema,
        notes: notesSchema,
        startedAt: dateInputSchema.optional(),
        finishedAt: dateInputSchema.optional(),
        tags: tagsSchema,
    }).superRefine(validateLogDateConstraints)
)

export const createLogSchema = z.preprocess(
    normalizeDateKeys,
    z.object({
        mediaId: mediaIdSchema,
        status: statusSchema,
        rating: ratingSchema,
        notes: notesSchema,
        startedAt: dateInputSchema.optional(),
        finishedAt: dateInputSchema.optional(),
        tags: tagsSchema,
    }).superRefine(validateLogDateConstraints)
)

export const updateLogSchema = z.preprocess(
    normalizeDateKeys,
    z.object({
        status: statusSchema,
        rating: ratingSchema,
        notes: notesSchema,
        startedAt: dateInputSchema.optional(),
        finishedAt: dateInputSchema.optional(),
        tags: tagsSchema,
    }).superRefine(validateLogDateConstraints)
)

// schema for deletion (optional confirm flag)
export const deleteLogSchema = z.object({
    confirm: z.boolean()
})
