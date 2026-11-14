export const MEDIA_INCLUDE = {
    mediaType: true,
    genres: {
        include: { genre: true },
        orderBy: { position: "asc" as const },
    },
    creators: {
        include: { creator: true },
        orderBy: { position: "asc" as const },
    },
} as const

export type FormattedMedia<T> = T & { genres: string[]; creators: { name: string; role: string }[] }

type RawMedia = {
    genres?: Array<{ position?: number | null; genre?: { name?: string | null } | null; name?: string | null }>
    creators?: Array<{ position?: number | null; role?: string | null; creator?: { name?: string | null } | null; name?: string | null }>
    [key: string]: unknown
}

export function formatMedia<T>(media: T): T extends null | undefined ? null : FormattedMedia<T> {
    if (!media) return null as T extends null | undefined ? null : FormattedMedia<T>
    const m = media as unknown as RawMedia
    const rawGenres = Array.isArray(m.genres) ? m.genres : []
    const genres: string[] = rawGenres
        .slice()
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((mg) => mg.genre?.name ?? (typeof mg === "string" ? mg : mg.name) ?? "")
        .filter(Boolean)

    const rawCreators = Array.isArray(m.creators) ? m.creators : []
    const creators: { name: string; role: string }[] = rawCreators
        .slice()
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((mc) => ({
            name: mc.creator?.name ?? mc.name ?? "",
            role: mc.role ?? "",
        }))
        .filter((c) => Boolean(c.name))

    return {
        ...m,
        genres,
        creators,
    } as unknown as T extends null | undefined ? null : FormattedMedia<T>
}
