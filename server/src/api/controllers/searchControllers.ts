import { NextFunction, Request, Response } from 'express'
import { searchService } from "@/services/search/searchService.js"
import { musicSearchService } from '@/services/search/lastFmSearchService.js'

// Returns the book info fetched from google books (A media shaped item without media type cus its enforced in frontend)
export const searchBooks = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    const q = req.query.q as string
    if (!q) {
        return res.status(400).json({ message: "Missing query" })
    }

    const startIndex = parseInt(req.query.startIndex as string) || 0

    try {
        const results = await searchService.searchBooks(userId, q, startIndex)
        res.status(200).json(results)
    } catch (error: any) {
        next(error)
    }
}

export const searchAlbums = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    const q = req.query.q as string
    if (!q) {
        return res.status(400).json({ message: "Missing query" })
    }

    const startIndex = parseInt(req.query.startIndex as string) || 0

    try {
        const results = await searchService.searchAblums(userId, q)
        res.status(200).json(results)
    } catch (error: any) {
        next(error)
    }
}

export const searchTracks = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    const q = req.query.q as string
    if (!q) {
        return res.status(400).json({ message: "Missing query" })
    }

    const startIndex = parseInt(req.query.startIndex as string) || 0

    try {
        const results = await searchService.searchTracks(userId, q)
        res.status(200).json(results)
    } catch (error: any) {
        next(error)
    }
}