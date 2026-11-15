import { Request, Response } from "express"
import { LIMITS } from "@/config/limits.js"
import { publicConfigSchema, PublicConfig } from "@/schemas/configSchemas.js"

export function getPublicConfig(): PublicConfig {
    return {
        limits: {
            notes: {
                maxLength: LIMITS.notes.maxLength,
            },
            tags: {
                maxLength: LIMITS.tags.maxLength,
                maxPerLog: LIMITS.tags.maxPerLog,
                maxPerUser: LIMITS.tags.maxPerUser,
            },
            collections: {
                nameMaxLength: LIMITS.collections.nameMaxLength,
                descMaxLength: LIMITS.collections.descMaxLength,
                maxPerUser: LIMITS.collections.maxPerUser,
                maxItemsPerCollection: LIMITS.collections.maxItemsPerCollection,
            },
            imports: {
                maxFileBytes: LIMITS.imports.maxFileBytes,
            },
            search: {
                queryMaxLength: LIMITS.search.queryMaxLength,
            },
        },
    }
}

export const getConfig = (_req: Request, res: Response) => {
    const config = getPublicConfig()
    const validated = publicConfigSchema.parse(config)
    res.setHeader("Cache-Control", "public, max-age=3600")
    res.status(200).json(validated)
}
