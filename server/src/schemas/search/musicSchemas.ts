import { z } from "zod"

export const lastFmTrackSchema = z.object({
    name: z.string(),
    artist: z.string(),
    mbid: z.string().nullable(),
    url: z.string(),
    image: z.array(z.object({
        "#text": z.string(),
        size: z.string()
    })).optional(),
})

export const lastFmAlbumSchema = z.object({
    name: z.string(),
    artist: z.string(),
    mbid: z.string().nullable(),
    url: z.string(),
    image: z.array(z.object({
        "#text": z.string(),
        size: z.string()
    })).optional(),
})

export const lastFmTrackSearchResponse = z.object({
    results: z.object({
        trackmatches: z.object({
            track: z.array(lastFmTrackSchema).optional()
        })
    }).optional()
})

export const lastFmAlbumSearchResponse = z.object({
    results: z.object({
        albummatches: z.object({
            album: z.array(lastFmAlbumSchema).optional()
        })
    }).optional()
})
