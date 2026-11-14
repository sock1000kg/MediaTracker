import { z } from "zod"
import {
    MAX_COLLECTION_DESC_LENGTH,
    normalizeCollectionName,
    sanitizeCollectionDescription,
} from "@/utilities.js"

const nameField = z.string().superRefine((val, ctx) => {
    const norm = normalizeCollectionName(val)
    if (!norm) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Invalid collection name: must be 1-80 characters",
        })
    }
}).transform((val) => normalizeCollectionName(val)!)

const createDescField = z
    .string()
    .max(MAX_COLLECTION_DESC_LENGTH, "Description must be 1000 characters or fewer")
    .nullable()
    .optional()
    .transform((val) => sanitizeCollectionDescription(val))

const updateDescField = z
    .string()
    .max(MAX_COLLECTION_DESC_LENGTH, "Description must be 1000 characters or fewer")
    .nullable()
    .optional()
    .transform((val) => (val === undefined ? undefined : sanitizeCollectionDescription(val)))

export const createCollectionSchema = z.object({
    name: nameField,
    description: createDescField,
    ranked: z.boolean().optional().default(false),
})

export const updateCollectionSchema = z.object({
    name: nameField.optional(),
    description: updateDescField,
    ranked: z.boolean().optional(),
})

export const addCollectionItemSchema = z.object({
    logId: z.number().int().positive("Invalid logId"),
})

export const reorderCollectionSchema = z.object({
    logIds: z.array(z.number().int().positive("Invalid logId")),
})
