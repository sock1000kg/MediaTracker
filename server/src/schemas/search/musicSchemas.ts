import { z } from "zod"

export const albumDetailsSchema = z.object({
    format: z.string().nullable().optional(),
    formatTags: z.array(z.string()).nullable().optional(),
}).strict()

export type AlbumDetails = z.infer<typeof albumDetailsSchema>

export const trackDetailsSchema = z.object({
    durationSec: z.number().nullable().optional(),
}).strict()

export type TrackDetails = z.infer<typeof trackDetailsSchema>

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

export const lastFmAlbumInfoTrackSchema = z.object({
    name: z.string().default("Unknown track"),
    url: z.string().optional().default(""),
    duration: z.union([z.number(), z.string()]).nullable().optional(),
    "@attr": z.object({
        rank: z.union([z.number(), z.string()]).optional(),
    }).optional(),
    artist: z.union([
        z.string(),
        z.object({
            name: z.string().optional(),
            mbid: z.string().nullable().optional(),
            url: z.string().optional(),
        })
    ]).optional(),
    streamable: z.any().optional(),
})

export const lastFmAlbumInfoResponseSchema = z.object({
    album: z.object({
        name: z.string(),
        artist: z.string(),
        mbid: z.string().nullable().optional(),
        url: z.string().optional().default(""),
        image: z.array(z.object({
            "#text": z.string(),
            size: z.string()
        })).optional(),
        tracks: z.object({
            track: z
                .union([lastFmAlbumInfoTrackSchema, z.array(lastFmAlbumInfoTrackSchema)])
                .optional()
                .transform(val => val === undefined ? [] : Array.isArray(val) ? val : [val])
        }).optional(),
        wiki: z.object({
            published: z.string().optional(),
            summary: z.string().optional(),
            content: z.string().optional(),
        }).optional(),
    }).optional()
})

