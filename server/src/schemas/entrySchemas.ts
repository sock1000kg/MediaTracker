import { z } from "zod"
import { LIMITS } from "@/config/limits.js"
import { toDayPrecision } from "@/utilities.js"

/** Which version of the item you had that time. Every key optional, unknown keys rejected, empty → null. */
const editionText = (max: number) => z.string().trim().max(max)

export const editionObjectSchema = z.object({
    title: editionText(300).optional(),
    format: editionText(60).optional(),
    language: editionText(35).optional(),
}).strict()

export type Edition = { title?: string; format?: string; language?: string }

/** Drops blank values; an object with nothing left becomes null. */
export function compactEdition(value: z.infer<typeof editionObjectSchema>): Edition | null {
    const out: Edition = {}
    if (value.title) out.title = value.title
    if (value.format) out.format = value.format
    if (value.language) out.language = value.language
    return Object.keys(out).length > 0 ? out : null
}

export const editionSchema = editionObjectSchema.transform(compactEdition)

// undefined = leave as is, null = clear
const optionalEditionSchema = z.union([editionSchema, z.null()]).optional()

// Day-precision date: noon UTC of the calendar day, null (clear) or undefined (leave)
export const dateInputSchema = z.preprocess((val: unknown) => {
    if (val === undefined) return undefined
    if (val === null || val === "") return null
    const d = toDayPrecision(val)
    return d ?? "invalid"
}, z.union([z.date(), z.null(), z.undefined()]))

const progressValue = z.number().int().nonnegative().nullable().optional()

const noteSchema = z.preprocess((val: unknown) => {
    if (val === undefined) return undefined
    if (val === null) return null
    if (typeof val !== "string") return val
    const trimmed = val.trim()
    return trimmed === "" ? null : trimmed
}, z.string().max(LIMITS.logs.entryNoteMaxLength, `Entry note can't exceed ${LIMITS.logs.entryNoteMaxLength} characters`).nullable().optional())

export function validateEntryDates(
    data: { startedAt?: Date | null; finishedAt?: Date | null },
    ctx: z.RefinementCtx
) {
    const now = new Date()
    // Allow up to tomorrow noon UTC for timezone differences
    const maxFuture = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 12, 0, 0, 0))

    if (data.startedAt && data.startedAt.getTime() > maxFuture.getTime()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Date cannot be more than 1 day in the future", path: ["startedAt"] })
    }
    if (data.finishedAt && data.finishedAt.getTime() > maxFuture.getTime()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Date cannot be more than 1 day in the future", path: ["finishedAt"] })
    }
    if (data.startedAt && data.finishedAt && data.finishedAt.getTime() < data.startedAt.getTime()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Finished date can't be before the start date", path: ["finishedAt"] })
    }
}

const entryShape = {
    startedAt: dateInputSchema.optional(),
    finishedAt: dateInputSchema.optional(),
    progressEpisodes: progressValue,
    progressChapters: progressValue,
    progressVolumes: progressValue,
    note: noteSchema,
    edition: optionalEditionSchema,
}

/** One entry, as sent when it is created (alone, or together with its log). */
export const entryInputSchema = z.object(entryShape).strict().superRefine(validateEntryDates)
export type EntryInput = z.infer<typeof entryInputSchema>

/** Fields of an existing entry to change; absent keys stay as they are. */
export const updateEntrySchema = entryInputSchema

/** The date-or-progress keys that now belong to an entry, not to a log. */
export const ENTRY_ONLY_KEYS = [
    "startedAt", "finishedAt", "started_at", "finished_at",
    "progress", "progressEpisodes", "progressChapters", "progressVolumes",
] as const
