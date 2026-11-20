import { z } from 'zod'
import { uuidSchema } from '@/schemas/common.js'
import { NextFunction, Request, Response } from 'express'
import { searchService } from "@/services/search/searchService.js"
import { sanitizeQuery } from '@/utilities.js'
import { LIMITS } from '@/config/limits.js'
import { animeSearchQuerySchema, mangaSearchQuerySchema } from '@/schemas/search/animeSchemas.js'
import { movieSearchQuerySchema } from '@/schemas/search/movieSchemas.js'
import { tvSearchQuerySchema } from '@/schemas/search/tvSchemas.js'
import { gameSearchQuerySchema } from '@/schemas/search/gameSchemas.js'
import { bookSearchQuerySchema } from '@/schemas/search/bookSchemas.js'
import { bggSearchQuerySchema } from '@/schemas/search/bggSchemas.js'

const albumTracksIdsSchema = z.object({
    mbid: uuidSchema.optional(),
    releaseGroupId: uuidSchema.optional(),
})

const nonEmptyString = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim() ? v.trim() : undefined

// Returns books from Open Library (A media shaped item without media type cus its enforced in frontend)
export const searchBooks = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    const parsedQuery = bookSearchQuerySchema.safeParse(req.query)
    if (!parsedQuery.success) {
        const message = parsedQuery.error.issues.map(i => i.message).join("; ")
        return res.status(400).json({ message })
    }
    const { q, page, ...filters } = parsedQuery.data

    try {
        const results = await searchService.searchBooks(userId, q, page, filters)
        res.status(200).json(results)
    } catch (error) {
        next(error)
    }
}

export const searchAlbums = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    const rawQ = typeof req.query.q === "string" ? req.query.q : ""
    const q = sanitizeQuery(rawQ)
    if (!q) {
        return res.status(400).json({ message: "Missing query" })
    }
    if (rawQ.trim().length > LIMITS.search.queryMaxLength) {
        return res.status(400).json({ message: `Search query must be at most ${LIMITS.search.queryMaxLength} characters` })
    }

    const page = parseInt(req.query.page as string) || 1

    try {
        const results = await searchService.searchAlbums(userId, q, page)
        res.status(200).json(results)
    } catch (error) {
        next(error)
    }
}

export const getAlbumTracks = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    const artist = typeof req.query.artist === "string" ? req.query.artist.trim() : ""
    const album = typeof req.query.album === "string" ? req.query.album.trim() : ""
    // These come from the client: they must be MusicBrainz ids (UUIDs), not arbitrary strings
    const idsQuery = albumTracksIdsSchema.safeParse({
        mbid: nonEmptyString(req.query.mbid),
        releaseGroupId: nonEmptyString(req.query.releaseGroupId) ?? nonEmptyString(req.query.mbReleaseGroupId),
    })
    if (!idsQuery.success) {
        return res.status(400).json({ message: "mbid and releaseGroupId must be valid MusicBrainz ids" })
    }
    const { mbid, releaseGroupId } = idsQuery.data

    if (!releaseGroupId && !mbid && (!artist || !album)) {
        return res.status(400).json({ message: "Artist and album, mbid, or releaseGroupId are required" })
    }

    try {
        const results = await searchService.getAlbumTracks(userId, artist, album, mbid, releaseGroupId)
        res.status(200).json(results)
    } catch (error) {
        next(error)
    }
}

export const searchTracks = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    const rawQ = typeof req.query.q === "string" ? req.query.q : ""
    const q = sanitizeQuery(rawQ)
    if (!q) {
        return res.status(400).json({ message: "Missing query" })
    }
    if (rawQ.trim().length > LIMITS.search.queryMaxLength) {
        return res.status(400).json({ message: `Search query must be at most ${LIMITS.search.queryMaxLength} characters` })
    }

    const page = parseInt(req.query.page as string) || 1

    try {
        const results = await searchService.searchTracks(userId, q, page)
        res.status(200).json(results)
    } catch (error) {
        next(error)
    }
}

const animeMangaSearch = (mode: "anime" | "manga") => async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    const schema = mode === "anime" ? animeSearchQuerySchema : mangaSearchQuerySchema
    const parsedQuery = schema.safeParse(req.query)
    if (!parsedQuery.success) {
        const message = parsedQuery.error.issues.map(i => i.message).join("; ")
        return res.status(400).json({ message })
    }
    const { q, page, ...filters } = parsedQuery.data

    try {
        const results = mode === "anime"
            ? await searchService.searchAnime(userId, q, page, filters)
            : await searchService.searchManga(userId, q, page, filters)
        res.status(200).json(results)
    } catch (error) {
        next(error)
    }
}

export const searchAnime = animeMangaSearch("anime")
export const searchManga = animeMangaSearch("manga")

export const searchMovies = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    const parsedQuery = movieSearchQuerySchema.safeParse(req.query)
    if (!parsedQuery.success) {
        const message = parsedQuery.error.issues.map(i => i.message).join("; ")
        return res.status(400).json({ message })
    }
    const { q, page, ...filters } = parsedQuery.data

    try {
        const results = await searchService.searchMovies(userId, q, page, filters)
        res.status(200).json(results)
    } catch (error) {
        next(error)
    }
}

export const searchGames = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    const parsedQuery = gameSearchQuerySchema.safeParse(req.query)
    if (!parsedQuery.success) {
        const message = parsedQuery.error.issues.map(i => i.message).join("; ")
        return res.status(400).json({ message })
    }
    const { q, page, ...filters } = parsedQuery.data

    try {
        const results = await searchService.searchGames(userId, q, page, filters)
        res.status(200).json(results)
    } catch (error) {
        next(error)
    }
}

export const searchTv = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    const parsedQuery = tvSearchQuerySchema.safeParse(req.query)
    if (!parsedQuery.success) {
        const message = parsedQuery.error.issues.map(i => i.message).join("; ")
        return res.status(400).json({ message })
    }
    const { q, page, ...filters } = parsedQuery.data

    try {
        const results = await searchService.searchTv(userId, q, page, filters)
        res.status(200).json(results)
    } catch (error) {
        next(error)
    }
}

export const getTvSeasons = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    const tmdbId = Number(req.params.tmdbId)
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
        return res.status(400).json({ message: "Invalid TV show ID" })
    }

    try {
        const results = await searchService.getTvSeasons(userId, tmdbId)
        res.status(200).json(results)
    } catch (error) {
        next(error)
    }
}

export const searchBoardGames = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    const parsedQuery = bggSearchQuerySchema.safeParse(req.query)
    if (!parsedQuery.success) {
        const message = parsedQuery.error.issues.map(i => i.message).join("; ")
        return res.status(400).json({ message })
    }
    const { q, page } = parsedQuery.data

    try {
        const results = await searchService.searchBoardGames(userId, q, page)
        res.status(200).json(results)
    } catch (error) {
        next(error)
    }
}

