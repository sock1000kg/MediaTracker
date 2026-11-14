import prisma from "@/prismaClient.js"
import { DbClient } from "@/db.js"

export const JUNK_BOOK_SUBJECTS: readonly string[] = [
    "accessible book",
    "protected daisy",
    "in library",
    "lending library",
    "large type books",
    "overdrive",
    "internet archive wishlist",
    "open library staff picks",
    "new york times bestseller",
    "new york times reviewed",
]

export const JUNK_MUSIC_TAGS: readonly string[] = [
    "seen live", "favorites", "favourites", "favorite", "favourite", "my favorite",
    "albums i own", "albums i have", "love", "loved", "awesome", "beautiful", "amazing",
    "cool", "check out", "spotify", "vinyl", "owned", "to listen", "under 2000 listeners",
]

const JUNK_MUSIC_PREFIXES = ["favorite ", "favourite "]

export const JUNK_RAWG_TAGS: readonly string[] = [
    "singleplayer", "steam achievements", "full controller support", "partial controller support",
    "steam cloud", "steam trading cards", "steam-trading-cards", "steam leaderboards", "steam workshop",
    "steam turn notifications", "steam vr collectibles", "controller support", "cloud saves", "achievements",
    "stats", "includes level editor", "includes source sdk", "in-app purchases", "early access",
    "captions available", "commentary available", "remote play on tv", "remote play together",
    "family sharing", "mouse only option",
]

export function isJunkGenre(name: string, mediaTypeName?: string | null): boolean {
    const s = name.trim().toLowerCase()
    if (!s) return true
    const type = mediaTypeName?.toLowerCase()

    if (type === "book") {
        if (s.includes("=") || /:\S/.test(s)) return true
        if (JUNK_BOOK_SUBJECTS.includes(s)) return true
        if (/[(),]/.test(s)) return true
        const words = s.split(/\s+/).filter(Boolean)
        if (words.length > 3) return true
        return false
    }

    if (type === "music") {
        if (JUNK_MUSIC_TAGS.includes(s)) return true
        if (JUNK_MUSIC_PREFIXES.some(p => s.startsWith(p))) return true
        if (/^\d{4}$/.test(name.trim())) return true
        return false
    }

    if (type === "game") {
        if (JUNK_RAWG_TAGS.includes(s)) return true
        return false
    }

    return false
}

export function maxGenresForType(typeName?: string | null): number {
    const t = typeName?.toLowerCase()
    if (t === "book") return 3
    if (t === "music") return 5
    if (t === "game") return 10
    if (t === "anime" || t === "manga") return 10
    return 10
}

export function defaultRoleForType(mediaTypeName?: string | null): string {
    const t = mediaTypeName?.toLowerCase()
    switch (t) {
        case "book": return "author"
        case "music": return "artist"
        case "movie": return "director"
        case "game": return "developer"
        case "anime": return "studio"
        case "manga": return "author"
        case "tv": return "creator"
        default: return "creator"
    }
}

export function genreNameKey(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, " ")
}

export function creatorNameKey(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, " ")
}

export async function setMediaGenres(
    mediaId: number,
    names: (string | null | undefined)[] | null | undefined,
    mediaTypeName: string | null | undefined,
    tx: DbClient = prisma
): Promise<string[]> {
    const clean: { name: string; nameKey: string }[] = []
    const seen = new Set<string>()
    const cap = maxGenresForType(mediaTypeName)

    for (const raw of names ?? []) {
        if (typeof raw !== "string") continue
        const name = raw.trim()
        if (!name || isJunkGenre(name, mediaTypeName)) continue
        const key = genreNameKey(name)
        if (seen.has(key)) continue
        seen.add(key)
        clean.push({ name, nameKey: key })
        if (clean.length === cap) break
    }

    await tx.mediaGenre.deleteMany({ where: { mediaId } })

    if (clean.length === 0) {
        return []
    }

    const genreRecords: { id: number; name: string }[] = []
    for (const item of clean) {
        const g = await tx.genre.upsert({
            where: { nameKey: item.nameKey },
            update: {},
            create: { name: item.name, nameKey: item.nameKey },
        })
        genreRecords.push(g)
    }

    await tx.mediaGenre.createMany({
        data: genreRecords.map((g, index) => ({
            mediaId,
            genreId: g.id,
            position: index,
        })),
        skipDuplicates: true,
    })

    return genreRecords.map(g => g.name)
}

export interface CreatorInput {
    name: string
    role?: string
}

export async function setMediaCreators(
    mediaId: number,
    creators: CreatorInput[] | null | undefined,
    mediaTypeName: string | null | undefined,
    creatorDisplayString: string | null | undefined,
    tx: DbClient = prisma
): Promise<{ name: string; role: string }[]> {
    let candidateCreators: CreatorInput[] = []

    if (creators && creators.length > 0) {
        candidateCreators = creators
    } else if (creatorDisplayString && creatorDisplayString.trim()) {
        const type = mediaTypeName?.toLowerCase()
        const defaultRole = defaultRoleForType(mediaTypeName)
        if (type === "music") {
            // Never split music
            candidateCreators = [{ name: creatorDisplayString.trim(), role: "artist" }]
        } else {
            // Split on ", "
            candidateCreators = creatorDisplayString
                .split(", ")
                .map(s => s.trim())
                .filter(Boolean)
                .map(name => ({ name, role: defaultRole }))
        }
    }

    const clean: { name: string; nameKey: string; role: string }[] = []
    const seen = new Set<string>()
    const defaultRole = defaultRoleForType(mediaTypeName)

    for (const c of candidateCreators) {
        const name = c.name?.trim()
        if (!name) continue
        const role = c.role?.trim() || defaultRole
        const nameKey = creatorNameKey(name)
        const pairKey = `${nameKey}:${role}`
        if (seen.has(pairKey)) continue
        seen.add(pairKey)
        clean.push({ name, nameKey, role })
    }

    await tx.mediaCreator.deleteMany({ where: { mediaId } })

    if (clean.length === 0) {
        return []
    }

    const creatorIdMap = new Map<string, number>()
    for (const item of clean) {
        if (!creatorIdMap.has(item.nameKey)) {
            const cr = await tx.creator.upsert({
                where: { nameKey: item.nameKey },
                update: {},
                create: { name: item.name, nameKey: item.nameKey },
            })
            creatorIdMap.set(item.nameKey, cr.id)
        }
    }

    await tx.mediaCreator.createMany({
        data: clean.map((item, index) => ({
            mediaId,
            creatorId: creatorIdMap.get(item.nameKey)!,
            role: item.role,
            position: index,
        })),
        skipDuplicates: true,
    })

    return clean.map(c => ({ name: c.name, role: c.role }))
}

export async function pruneJunkGenres(client: DbClient = prisma): Promise<number> {
    try {
        const links = await client.mediaGenre.findMany({
            include: {
                genre: true,
                media: {
                    include: { mediaType: true },
                },
            },
        })

        const junkLinks: { mediaId: number; genreId: number }[] = []
        for (const link of links) {
            const mediaTypeName = link.media?.mediaType?.name
            if (isJunkGenre(link.genre.name, mediaTypeName)) {
                junkLinks.push({ mediaId: link.mediaId, genreId: link.genreId })
            }
        }

        let removedCount = 0
        for (const link of junkLinks) {
            await client.mediaGenre.delete({
                where: {
                    mediaId_genreId: { mediaId: link.mediaId, genreId: link.genreId },
                },
            })
            removedCount++
        }

        // Delete unlinked Genre rows
        await client.genre.deleteMany({
            where: {
                media: { none: {} },
            },
        })

        console.log(`Removed ${removedCount} junk genre links`)
        return removedCount
    } catch (error) {
        console.error("Failed to prune junk genres:", error)
        return 0
    }
}
