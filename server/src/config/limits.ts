export const LIMITS = {
    notes: {
        maxLength: 50_000,
    },
    tags: {
        maxLength: 40,
        maxPerLog: 20,
        maxPerUser: 500,
    },
    collections: {
        nameMaxLength: 80,
        descMaxLength: 1000,
        maxPerUser: 200,
        maxItemsPerCollection: 1000,
    },
    imports: {
        maxFileBytes: 10 * 1024 * 1024,
        letterboxdUnpackedEntryBytes: 10 * 1024 * 1024,
        letterboxdUnpackedTotalBytes: 20 * 1024 * 1024,
        malMaxEntries: 5000,
        maxFailures: 500,
    },
    prefs: {
        maxBytes: 4096,
    },
    apiKeys: {
        maxLength: 512,
    },
    queue: {
        maxPayloadBytes: 3 * 1024 * 1024,
    },
    search: {
        queryMaxLength: 100,
    },
} as const

export type Limits = typeof LIMITS
