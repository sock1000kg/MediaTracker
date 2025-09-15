import { sanitizeApiKey, sanitizeSource } from "@/utilities"
import { z } from "zod"

const keySchema = z
    .preprocess((val: string | null | undefined) => {
        return sanitizeApiKey(val)
    }, z
    .string({ message: "API must not be empty"})
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