import { z } from "zod"
import { LIMITS } from "@/config/limits.js"
import { uuidSchema } from "@/schemas/common.js"
import { toDayPrecision } from "@/utilities.js"

export const LETTER_MAX_YEARS_AHEAD = 25

const DAY_MS = 24 * 60 * 60 * 1000

const daySchema = z.string().transform((value, ctx) => {
    const day = toDayPrecision(value)
    if (!day) {
        ctx.addIssue({ code: "custom", message: "Not a valid date" })
        return z.NEVER
    }
    return day
})

/**
 * The writer's calendar day: what they sent, as long as some time zone could really be on that day,
 * else the server's UTC day.
 */
function writerDay(sent: Date | undefined, now = new Date()): Date {
    const server = toDayPrecision(now)!
    return sent && Math.abs(sent.getTime() - server.getTime()) <= DAY_MS ? sent : server
}

export const createLetterSchema = z.object({
    logId: uuidSchema,
    body: z.string().trim()
        .min(1, "A letter needs some words")
        .max(LIMITS.letters.bodyMaxLength, `A letter can't exceed ${LIMITS.letters.bodyMaxLength} characters`),
    opensAt: daySchema.nullable().optional(),
    opensOnRelog: z.boolean().optional(),
    // The writer's local date, so "at least tomorrow" means their tomorrow
    today: daySchema.optional(),
}).strict().superRefine((data, ctx) => {
    if (Boolean(data.opensAt) === Boolean(data.opensOnRelog)) {
        ctx.addIssue({ code: "custom", message: "Choose either a date or the next time you log it" })
        return
    }
    if (!data.opensAt) return
    const today = writerDay(data.today)
    if (data.opensAt.getTime() <= today.getTime()) {
        ctx.addIssue({ code: "custom", message: "The opening date must be tomorrow or later", path: ["opensAt"] })
    }
    const latest = new Date(today)
    latest.setUTCFullYear(latest.getUTCFullYear() + LETTER_MAX_YEARS_AHEAD)
    if (data.opensAt.getTime() > latest.getTime()) {
        ctx.addIssue({ code: "custom", message: `The opening date can't be more than ${LETTER_MAX_YEARS_AHEAD} years ahead`, path: ["opensAt"] })
    }
})
