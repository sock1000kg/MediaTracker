import { z } from "zod"
import { uuidSchema } from "@/schemas/common.js"
import {
    sanitizeStatus,
    sanitizeRating,
    sanitizeNotes,
    MAX_NOTES_LENGTH,
    allowedStatuses,
    AllowedStatus,
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

// Day-precision date schema: noon UTC of calendar day, or null, or undefined
const dateInputSchema = z.preprocess((val: unknown) => {
    if (val === undefined) return undefined
    if (val === null || val === "") return null
    const d = toDayPrecision(val)
    return d ?? "invalid"
}, z.union([z.date(), z.null(), z.undefined()]))

export const progressSchema = z.record(z.string(), z.unknown()).nullable().optional()
export const progressEpisodesSchema = z.number().int().nonnegative().nullable().optional()
export const progressChaptersSchema = z.number().int().nonnegative().nullable().optional()
export const progressVolumesSchema = z.number().int().nonnegative().nullable().optional()

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

const normalizeLogKeys = (val: unknown) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
        const obj = { ...(val as Record<string, unknown>) }
        if (obj.started_at !== undefined && obj.startedAt === undefined) {
            obj.startedAt = obj.started_at
        }
        if (obj.finished_at !== undefined && obj.finishedAt === undefined) {
            obj.finishedAt = obj.finished_at
        }
        if (obj.progress && typeof obj.progress === "object" && !Array.isArray(obj.progress)) {
            const p = obj.progress as Record<string, unknown>
            if (obj.progressEpisodes === undefined && p.watchedEpisodes !== undefined) {
                obj.progressEpisodes = p.watchedEpisodes
            }
            if (obj.progressChapters === undefined && p.readChapters !== undefined) {
                obj.progressChapters = p.readChapters
            }
            if (obj.progressVolumes === undefined && p.readVolumes !== undefined) {
                obj.progressVolumes = p.readVolumes
            }
        }
        return obj
    }
    return val
}

//for when creating a log of a searched media (no mediaId cus its not in db yet)
export const searchLogSchema = z.preprocess(
    normalizeLogKeys,
    z.object({ 
        status: statusSchema,
        rating: ratingSchema,
        notes: notesSchema,
        startedAt: dateInputSchema.optional(),
        finishedAt: dateInputSchema.optional(),
        progress: progressSchema,
        progressEpisodes: progressEpisodesSchema,
        progressChapters: progressChaptersSchema,
        progressVolumes: progressVolumesSchema,
        tags: tagsSchema,
    }).superRefine(validateLogDateConstraints)
)

export const createLogSchema = z.preprocess(
    normalizeLogKeys,
    z.object({
        mediaId: mediaIdSchema,
        status: statusSchema,
        rating: ratingSchema,
        notes: notesSchema,
        startedAt: dateInputSchema.optional(),
        finishedAt: dateInputSchema.optional(),
        progress: progressSchema,
        progressEpisodes: progressEpisodesSchema,
        progressChapters: progressChaptersSchema,
        progressVolumes: progressVolumesSchema,
        tags: tagsSchema,
    }).superRefine(validateLogDateConstraints)
)

export const updateLogSchema = z.preprocess(
    normalizeLogKeys,
    z.object({
        status: updateStatusSchema,
        rating: updateRatingSchema,
        notes: updateNotesSchema,
        startedAt: dateInputSchema.optional(),
        finishedAt: dateInputSchema.optional(),
        progress: progressSchema,
        progressEpisodes: progressEpisodesSchema,
        progressChapters: progressChaptersSchema,
        progressVolumes: progressVolumesSchema,
        tags: tagsSchema,
    }).superRefine(validateLogDateConstraints)
)

// schema for deletion (optional confirm flag)
export const deleteLogSchema = z.object({
    confirm: z.boolean()
})
