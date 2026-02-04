import { NextFunction, Request, Response } from 'express'
import { searchService } from "@/services/search/searchService.js"
import { sanitizeQuery } from '@/utilities.js'

// Returns the book info fetched from google books (A media shaped item without media type cus its enforced in frontend)
export const searchBooks = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    const q = req.query.q as string
    if (!q || q.length < 3) {
        return res.status(400).json("Search query must be at least 3 characters")
    }

    const page = parseInt(req.query.page as string) || 0

    try {
        const results = await searchService.searchBooks(userId, q, page)
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

    const page = parseInt(req.query.page as string) || 0

    try {
        const results = await searchService.searchAblums(userId, q, page)
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

    const page = parseInt(req.query.page as string) || 0

    try {
        const results = await searchService.searchTracks(userId, q, page)
        res.status(200).json(results)
    } catch (error) {
        next(error)
    }
}