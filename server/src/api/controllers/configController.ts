import { Request, Response } from "express"
import { LIMITS } from "@/config/limits.js"
import { publicConfigSchema, PublicConfig } from "@/schemas/configSchemas.js"

export function getPublicConfig(): PublicConfig {
    // Security gate: exposes demo credentials to the frontend ONLY if PUBLIC_DEMO=true AND DEMO_USER_PASSWORD is set.
    // In standard/self-hosted instances without public demo enabled, credentials remain hidden and null is returned.
    const isPublicDemo = process.env.PUBLIC_DEMO === "true"
    const demoPassword = process.env.DEMO_USER_PASSWORD
    const demo =
        isPublicDemo && demoPassword
            ? { username: "demo", password: demoPassword }
            : null

    return {
        limits: {
            notes: {
                maxLength: LIMITS.notes.maxLength,
            },
            logs: {
                maxEntriesPerLog: LIMITS.logs.maxEntriesPerLog,
                entryNoteMaxLength: LIMITS.logs.entryNoteMaxLength,
                entryNameMaxLength: LIMITS.logs.entryNameMaxLength,
            },
            letters: {
                bodyMaxLength: LIMITS.letters.bodyMaxLength,
                maxSealedPerLog: LIMITS.letters.maxSealedPerLog,
                maxPerUser: LIMITS.letters.maxPerUser,
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
        demo,
    }
}

export const getConfig = (_req: Request, res: Response) => {
    const config = getPublicConfig()
    const validated = publicConfigSchema.parse(config)
    // no-cache = revalidate every time (cheap: Express answers 304 via the ETag). A max-age kept the old
    // answer in browsers for an hour, so turning PUBLIC_DEMO on or off didn't show until it expired.
    res.setHeader("Cache-Control", "no-cache")
    res.status(200).json(validated)
}
