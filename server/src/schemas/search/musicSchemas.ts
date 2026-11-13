import { z } from "zod"

export const musicMetadataSchema = z.object({
    url: z.string().optional(),
    kind: z.enum(["album", "track"]).optional(),
    categories: z.array(z.string()).nullable().optional(),
})

export type MusicMetadata = z.infer<typeof musicMetadataSchema>

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

export type LastFmTrack = z.infer<typeof lastFmTrackSchema>
export type LastFmAlbum = z.infer<typeof lastFmAlbumSchema>
export type LastFmMusicItem = LastFmTrack | LastFmAlbum

export const lastFmTrackSearchResponseSchema = z.object({
    results: z.object({
        trackmatches: z.object({
            track: z.array(lastFmTrackSchema).optional()
        }),
        "opensearch:totalResults": z
            .string()
            .transform(val => Number(val)) // convert to number
            .nullable()
    }).optional()
})

export const lastFmAlbumSearchResponseSchema = z.object({
    results: z.object({
        albummatches: z.object({
            album: z.array(lastFmAlbumSchema).optional()
        }),
        "opensearch:totalResults": z
            .string() 
            .transform(val => Number(val)) // convert to number
            .nullable()
    }).optional()
})

export const lastFmTagSchema = z.object({
    name: z.string(),
    count: z.number()
})

// Last.fm returns a single object instead of an array when there is one tag, and omits `tag` when there are none
export const lastFmTopTagsResponseSchema = z.object({
    toptags: z.object({
        tag: z
            .union([lastFmTagSchema, z.array(lastFmTagSchema)])
            .optional()
            .transform(val => val === undefined ? [] : Array.isArray(val) ? val : [val])
    }).optional()
})
