import { NextFunction, Request, Response } from "express"
import { logService } from "@/services/logService.js"
import { idParamSchema, uuidSchema } from "@/schemas/common.js"
import { z } from "zod"
import { validateSchema } from "@/utilities.js"

// Get all logs
export const getLogs = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (userId == null) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    try {
        const logs = await logService.getAll(userId)
        res.status(200).json(logs)
    } catch (error) {
        next(error)
    }
}

//Create a log for userId
export const createNewLog = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }
    
    try {
        const log = await logService.create(userId, req.body)
        res.status(201).json(log)
    } catch (error) {
        next(error)
    }
}

//Update a log, need userId and logId
export const updateExistingLog = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    try {
        const { id } = validateSchema(idParamSchema, req.params)
        const updated = await logService.update(userId, id, req.body)
        res.status(200).json(updated)
    } catch (error) {
        next(error)
    }
}

// Delete a log for userId
export const deleteExistingLog = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    try {
        const { id } = validateSchema(idParamSchema, req.params)
        const result = await logService.delete(userId, id, req.body)
        res.status(200).json(result)
    } catch (error) {
        next(error)
    }
}

const entryParamsSchema = z.object({ id: uuidSchema, entryId: uuidSchema })

// Add an entry to a log
export const createLogEntry = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    try {
        const { id } = validateSchema(idParamSchema, req.params)
        const log = await logService.addEntry(userId, id, req.body)
        res.status(201).json(log)
    } catch (error) {
        next(error)
    }
}

// Edit an entry of a log
export const updateLogEntry = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    try {
        const { id, entryId } = validateSchema(entryParamsSchema, req.params)
        const log = await logService.updateEntry(userId, id, entryId, req.body)
        res.status(200).json(log)
    } catch (error) {
        next(error)
    }
}

// Delete an entry of a log
export const deleteLogEntry = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    try {
        const { id, entryId } = validateSchema(entryParamsSchema, req.params)
        const log = await logService.deleteEntry(userId, id, entryId)
        res.status(200).json(log)
    } catch (error) {
        next(error)
    }
}
