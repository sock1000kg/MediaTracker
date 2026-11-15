import { z } from "zod"

export const uuidSchema = z.uuid()

export const idParamSchema = z.object({
    id: uuidSchema,
})

export const idAndLogIdParamSchema = z.object({
    id: uuidSchema,
    logId: uuidSchema,
})
