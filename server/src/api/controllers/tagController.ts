import { NextFunction, Request, Response } from "express"
import { tagService } from "@/services/tagService.js"
import { idParamSchema } from "@/schemas/common.js"
import { validateSchema } from "@/utilities.js"

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

    try {
        const { id } = validateSchema(idParamSchema, req.params)
        const updated = await tagService.rename(userId, id, req.body)
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

    try {
        const { id } = validateSchema(idParamSchema, req.params)
        await tagService.delete(userId, id)
        res.status(204).send()
    } catch (error) {
        next(error)
    }
}
