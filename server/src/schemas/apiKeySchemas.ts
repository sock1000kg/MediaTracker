import { MAX_API_KEY_LENGTH, sanitizeApiKey, sanitizeSource } from "@/utilities.js"
import { z } from "zod"

const keySchema = z
    .preprocess((val: string | null | undefined) => {
        // Over-long input is passed on (trimmed) so .max() below gives a clear 400 instead of "must not be empty"
        if (typeof val === "string" && val.trim().length > MAX_API_KEY_LENGTH) return val.trim()
        return sanitizeApiKey(val)
    }, z
    .string({ message: "API must not be empty"})
    .max(MAX_API_KEY_LENGTH, `API key is too long (max ${MAX_API_KEY_LENGTH} characters)`)
)

const serviceSchema = z
    .preprocess((val: string | null | undefined) => {
        return sanitizeSource(val)
    }, z
    .string({ message: "Service must exist"})
)

export const addApiKeySchema = z.object({
    key: keySchema,
    service: serviceSchema
})

export const deleteApiKeySchema = z.object({
    service: serviceSchema
})