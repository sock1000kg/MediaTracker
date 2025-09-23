import { z } from "zod"
import { normalizeTypeName } from '@/utilities.js'

// Media Type name schema
const trimmedString = z
    .preprocess((val: string | null | undefined) => {
        return normalizeTypeName(val)
    }, z
    .string({ message: "Type name is required" })
    .min(1, { message: "Name is required" })
    .max(100, { message: "Name must be at most 100 characters" }) as z.ZodString
)

// schema for creating a media type
export const createMediaTypeSchema = z.object({
    name: trimmedString,
})

// schema for updating (renaming) a media type
export const updateMediaTypeSchema = z.object({
    newName: trimmedString
})

// schema for deletion (optional confirm flag)
export const deleteMediaTypeSchema = z.object({
    confirm: z.boolean()
})

