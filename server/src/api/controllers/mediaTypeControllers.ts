import { NextFunction, Request, Response } from 'express'
import { mediaTypeService } from "@/services/mediaTypeService.js"

export async function getAllMediaTypes(req: Request, res: Response, next: NextFunction) {
    const userId = req.userId
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    try {
        const types = await mediaTypeService.getAll(userId)
        res.status(200).json(types)
    } catch (error) {
        next(error)
    }
}

// Create a type, name sent in body
export async function createMediaType(req: Request, res: Response, next: NextFunction) {
    const userId = req.userId
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }
        
    try {
        const mediaType = await mediaTypeService.create(userId, req.body)
        res.status(201).json(mediaType)
    } catch (error) {
        next(error)
    }
}

//Delete a type, name sent in params
export async function deleteMediaType(req: Request, res: Response, next: NextFunction) {
    const userId = req.userId
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }
        
    try {
        const name = decodeURIComponent(req.params.name)

        const result = await mediaTypeService.delete(userId, name, req.body)
        res.status(200).json(result)
    } catch (error) {
        next(error)
    }
}

export async function updateMediaType(req: Request, res: Response, next: NextFunction) {
    const userId = req.userId
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    try {
        const name = decodeURIComponent(req.params.name)

        const updated = await mediaTypeService.update(userId, name, req.body)
        res.status(200).json(updated)
    } catch (error) {
        next(error)
    }
}
