import { NextFunction, Request, Response } from 'express'
import { searchService } from "@/services/search/searchService.js"
import { sanitizeQuery } from '@/utilities.js'
import { animeSearchQuerySchema, mangaSearchQuerySchema } from '@/schemas/search/animeSchemas.js'
import { movieSearchQuerySchema } from '@/schemas/search/movieSchemas.js'
import { tvSearchQuerySchema } from '@/schemas/search/tvSchemas.js'
import { gameSearchQuerySchema } from '@/schemas/search/gameSchemas.js'
import { bookSearchQuerySchema } from '@/schemas/search/bookSchemas.js'

// Returns the book info fetched from google books (A media shaped item without media type cus its enforced in frontend)
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

    const q = req.query.q as string
    sanitizeQuery(q)
    if (!q) {
        return res.status(400).json({ message: "Missing query" })
    }

    const page = parseInt(req.query.page as string) || 1

    try {
        const results = await searchService.searchAblums(userId, q, page)
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
    const mbid = typeof req.query.mbid === "string" && req.query.mbid.trim() ? req.query.mbid.trim() : undefined

    if (!mbid && (!artist || !album)) {
        return res.status(400).json({ message: "Artist and album or mbid are required" })
    }

    try {
        const results = await searchService.getAlbumTracks(userId, artist, album, mbid)
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

    const q = req.query.q as string
    sanitizeQuery(q)
    if (!q) {
        return res.status(400).json({ message: "Missing query" })
    }

    const page = parseInt(req.query.page as string) || 1

    try {
        const results = await searchService.searchTracks(userId, q, page)
        res.status(200).json(results)
    } catch (error) {
        next(error)
    }
}

const jikanSearch = (mode: "anime" | "manga") => async (req: Request, res: Response, next: NextFunction) => {
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

export const searchAnime = jikanSearch("anime")
export const searchManga = jikanSearch("manga")

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
