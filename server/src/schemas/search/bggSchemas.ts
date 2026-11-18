import { z } from "zod"
import { LIMITS } from "@/config/limits.js"

export const boardgameDetailsSchema = z.object({
    minPlayers: z.number().nullable().optional(),
    maxPlayers: z.number().nullable().optional(),
    playTimeMin: z.number().nullable().optional(),
    minPlayTimeMin: z.number().nullable().optional(),
    maxPlayTimeMin: z.number().nullable().optional(),
    score: z.number().nullable().optional(),
    scoreScale: z.literal("bgg_10").optional(),
}).strict()

export type BoardgameDetails = z.infer<typeof boardgameDetailsSchema>

const nl = <T extends z.ZodTypeAny>(s: T) => s.nullable().optional()

export const bggSearchQuerySchema = z.object({
    q: z.string().trim().min(1, "Search query is required").max(LIMITS.search.queryMaxLength, `Search query must be at most ${LIMITS.search.queryMaxLength} characters`),
    page: z.coerce.number().int().min(1).default(1),
})

export const bggSearchItemSchema = z.object({
    "@_type": nl(z.string()),
    "@_id": z.union([z.string(), z.number()]),
    name: nl(z.array(z.object({
        "@_type": nl(z.string()),
        "@_value": nl(z.string()),
    }))),
    yearpublished: nl(z.object({
        "@_value": nl(z.union([z.string(), z.number()])),
    })),
})

export const bggSearchResponseSchema = z.object({
    items: nl(z.object({
        "@_total": nl(z.union([z.string(), z.number()])),
        item: z.array(bggSearchItemSchema).default([]),
    })),
})

export const bggThingItemSchema = z.object({
    "@_type": nl(z.string()),
    "@_id": z.union([z.string(), z.number()]),
    thumbnail: nl(z.string()),
    image: nl(z.string()),
    name: nl(z.array(z.object({
        "@_type": nl(z.string()),
        "@_value": nl(z.string()),
        "@_sortindex": nl(z.union([z.string(), z.number()])),
    }))),
    description: nl(z.string()),
    yearpublished: nl(z.object({
        "@_value": nl(z.union([z.string(), z.number()])),
    })),
    minplayers: nl(z.object({
        "@_value": nl(z.union([z.string(), z.number()])),
    })),
    maxplayers: nl(z.object({
        "@_value": nl(z.union([z.string(), z.number()])),
    })),
    playingtime: nl(z.object({
        "@_value": nl(z.union([z.string(), z.number()])),
    })),
    minplaytime: nl(z.object({
        "@_value": nl(z.union([z.string(), z.number()])),
    })),
    maxplaytime: nl(z.object({
        "@_value": nl(z.union([z.string(), z.number()])),
    })),
    link: nl(z.array(z.object({
        "@_type": nl(z.string()),
        "@_id": nl(z.union([z.string(), z.number()])),
        "@_value": nl(z.string()),
    }))),
    statistics: nl(z.object({
        ratings: nl(z.object({
            usersrated: nl(z.object({
                "@_value": nl(z.union([z.string(), z.number()])),
            })),
            average: nl(z.object({
                "@_value": nl(z.union([z.string(), z.number()])),
            })),
        })),
    })),
})

export const bggThingResponseSchema = z.object({
    items: nl(z.object({
        item: z.array(bggThingItemSchema).default([]),
    })),
})

export type BggSearchItem = z.infer<typeof bggSearchItemSchema>
export type BggThingItem = z.infer<typeof bggThingItemSchema>
