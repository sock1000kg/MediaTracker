import { z } from "zod"

export const publicConfigLimitsSchema = z.object({
    notes: z.object({
        maxLength: z.number().int().positive(),
    }),
    logs: z.object({
        maxEntriesPerLog: z.number().int().positive(),
        entryNoteMaxLength: z.number().int().positive(),
        entryNameMaxLength: z.number().int().positive(),
    }),
    tags: z.object({
        maxLength: z.number().int().positive(),
        maxPerLog: z.number().int().positive(),
        maxPerUser: z.number().int().positive(),
    }),
    collections: z.object({
        nameMaxLength: z.number().int().positive(),
        descMaxLength: z.number().int().positive(),
        maxPerUser: z.number().int().positive(),
        maxItemsPerCollection: z.number().int().positive(),
    }),
    imports: z.object({
        maxFileBytes: z.number().int().positive(),
    }),
    search: z.object({
        queryMaxLength: z.number().int().positive(),
    }),
})

export const publicDemoSchema = z
    .object({
        username: z.string(),
        password: z.string(),
    })
    .nullable()

export const publicConfigSchema = z.object({
    limits: publicConfigLimitsSchema,
    demo: publicDemoSchema,
})

export type PublicConfig = z.infer<typeof publicConfigSchema>
