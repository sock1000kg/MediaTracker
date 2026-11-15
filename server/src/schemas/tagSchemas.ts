import { z } from "zod"
import { normalizeTagName } from "@/utilities.js"

export const tagInputSchema = z.object({
    name: z.string().superRefine((val, ctx) => {
        const norm = normalizeTagName(val)
        if (!norm) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Invalid tag name: must be 1-40 characters without commas",
            })
        }
    }).transform((val) => normalizeTagName(val)!),
})
