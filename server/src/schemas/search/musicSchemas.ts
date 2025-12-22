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
