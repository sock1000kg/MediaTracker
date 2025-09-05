import { z } from "zod"
import { normalizeTypeName } from '@/utilities'

// Media Type name schema
const trimmedString = () =>
    z.preprocess((val) => {
            if (typeof val === "string") return normalizeTypeName(val)
            return val
        }, z
        .string()
        .min(1, { message: "Name is required" })
        .max(100, { message: "Name must be at most 100 characters" }) as z.ZodString
    )

// schema for creating a media type
export const createMediaTypeSchema = z.object({
    name: trimmedString(),
})

// schema for updating (renaming) a media type
export const updateMediaTypeSchema = z.object({
    newName: trimmedString()
})

// schema for deletion (optional confirm flag)
export const deleteMediaTypeSchema = z.object({
    confirm: z.boolean().optional(),
})

export type CreateMediaTypeInput = z.infer<typeof createMediaTypeSchema>
export type UpdateMediaTypeInput = z.infer<typeof updateMediaTypeSchema>
export type DeleteMediaTypeInput = z.infer<typeof deleteMediaTypeSchema>
