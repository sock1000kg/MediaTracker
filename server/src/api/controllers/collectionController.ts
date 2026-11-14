import { NextFunction, Request, Response } from "express"
import { collectionService } from "@/services/collectionService.js"

export const getCollections = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (userId == null) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    try {
        const collections = await collectionService.getAll(userId)
        res.status(200).json(collections)
    } catch (error) {
        next(error)
    }
}

export const getCollectionById = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (userId == null) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid collection id" })
    }

    try {
        const collection = await collectionService.getById(userId, id)
        res.status(200).json(collection)
    } catch (error) {
        next(error)
    }
}

export const createCollection = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (userId == null) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    try {
        const collection = await collectionService.create(userId, req.body)
        res.status(201).json(collection)
    } catch (error) {
        next(error)
    }
}

export const updateCollection = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (userId == null) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid collection id" })
    }

    try {
        const updated = await collectionService.update(userId, id, req.body)
        res.status(200).json(updated)
    } catch (error) {
        next(error)
    }
}

export const deleteCollection = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (userId == null) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid collection id" })
    }

    try {
        await collectionService.delete(userId, id)
        res.status(204).send()
    } catch (error) {
        next(error)
    }
}

export const addItemToCollection = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (userId == null) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid collection id" })
    }

    try {
        const item = await collectionService.addItem(userId, id, req.body)
        res.status(201).json(item)
    } catch (error) {
        next(error)
    }
}

export const removeItemFromCollection = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (userId == null) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid collection id" })
    }

    const logId = parseInt(req.params.logId, 10)
    if (isNaN(logId)) {
        return res.status(400).json({ message: "Invalid log id" })
    }

    try {
        await collectionService.removeItem(userId, id, logId)
        res.status(204).send()
    } catch (error) {
        next(error)
    }
}

export const reorderCollection = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (userId == null) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid collection id" })
    }

    try {
        const result = await collectionService.reorder(userId, id, req.body)
        res.status(200).json(result)
    } catch (error) {
        next(error)
    }
}
