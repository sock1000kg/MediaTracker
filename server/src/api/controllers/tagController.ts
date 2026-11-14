import { NextFunction, Request, Response } from "express"
import { tagService } from "@/services/tagService.js"

export const getTags = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (userId == null) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    try {
        const tags = await tagService.getAll(userId)
        res.status(200).json(tags)
    } catch (error) {
        next(error)
    }
}

export const createTag = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (userId == null) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    try {
        const tag = await tagService.create(userId, req.body)
        res.status(201).json(tag)
    } catch (error) {
        next(error)
    }
}

export const renameTag = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (userId == null) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    const tagId = parseInt(req.params.id, 10)
    if (isNaN(tagId)) {
        return res.status(400).json({ message: "Invalid tag id" })
    }

    try {
        const updated = await tagService.rename(userId, tagId, req.body)
        res.status(200).json(updated)
    } catch (error) {
        next(error)
    }
}

export const deleteTag = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (userId == null) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    const tagId = parseInt(req.params.id, 10)
    if (isNaN(tagId)) {
        return res.status(400).json({ message: "Invalid tag id" })
    }

    try {
        await tagService.delete(userId, tagId)
        res.status(204).send()
    } catch (error) {
        next(error)
    }
}
