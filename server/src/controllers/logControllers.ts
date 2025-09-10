import { Request, Response } from "express"
import {
    getAllLogs,
    createLog,
    findLogOfUserByMediaId,
    findLogById,
    findMediaForUserById,
    findMediaTypeForUserOrGlobal,
    createMediaTypeForUser,
    updateLog,
    deleteLog,
} from "@/controllers/dbCalls/dbControllers"

import { z, ZodError } from "zod"
import { createLogSchema, deleteLogSchema, updateLogSchema } from "@/schemas/logSchemas"
import { validateSchema } from "@/utilities"

// Get all logs
export const getLogs = async (req: Request, res: Response) => {
    const userId = req.userId
    if (userId == null) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    try {
        const logs = await getAllLogs(userId)
        res.status(200).json(logs)
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: "Failed to fetch user logs" })
    }
}

//Create a log
export const createNewLog = async (req: Request, res: Response) => {
    const userId = req.userId
    if (!userId) return res.status(401).json({ message: "Unauthorized: missing userId" })
    
    try {
        //Sanitization
        const { mediaId, status, rating, notes } = validateSchema(createLogSchema, req.body)

        const existingLog = await findLogOfUserByMediaId(userId, mediaId)
        if (existingLog)
        return res.status(409).json({ message: "Your log of this media already exists" })

        const media = await findMediaForUserById(mediaId, userId)
        if (!media) return res.status(404).json({ message: "Media does not exist or you do not own it" })

        if (!media.mediaType) {
            return res.status(500).json({ message: "Media type is missing" })
        }

        let mediaType = await findMediaTypeForUserOrGlobal(media.mediaType.name, userId)
        if (!mediaType) mediaType = await createMediaTypeForUser(media.mediaType.name, userId)

        const log = await createLog(userId, mediaId, status, rating, notes)
        res.status(201).json(log)
    } catch (error) {
        if (error instanceof ZodError) {
        // return first validation error as JSON
            return res.status(400).json({
                message: error.issues[0]?.message || "Validation failed",
                errors: error.issues
            })
        }

        console.error(error)
        res.status(500).json({ message: "Failed to create user log" })
    }
}

//Update a log
export const updateExistingLog = async (req: Request, res: Response) => {
    const userId = req.userId
    if (!userId) return res.status(401).json({ message: "Unauthorized: missing userId" })

    const logId = parseInt(req.params.id)
    if(!logId) return res.status(400).json({ message: "Invalid params" })

        
    try {
        //Sanitization
        const { status: newStatus, rating: newRating, notes: newNotes } = validateSchema(updateLogSchema, req.body)

        const existingLog = await findLogById(logId)
        if (!existingLog) return res.status(404).json({ message: "Log does not exist" })
        if (existingLog.userId !== userId)
        return res.status(401).json({ message: "You can only edit logs that you created" })

        const updated = await updateLog(logId, newStatus, newRating, newNotes)
        res.status(200).json(updated)
    } catch (error) {
        if (error instanceof ZodError) {
        // return first validation error as JSON
            return res.status(400).json({
                message: error.issues[0]?.message || "Validation failed",
                errors: error.issues
            })
        }
        console.error(error)
        res.status(500).json({ message: "Failed to update user log" })
    }
}


// Delete a log
export const deleteExistingLog = async (req: Request, res: Response) => {
    const userId = Number(req.userId)
    if (!userId) return res.status(401).json({ message: "Unauthorized: missing userId" })
        
    const logId = parseInt(req.params.id)
    if(!logId) return res.status(400).json({ message: "Invalid params" })
        
        
    try {
        //Sanitization
        const { confirm } = validateSchema(deleteLogSchema, req.body)

        const existingLog = await findLogById(logId)
        if (!existingLog) return res.status(404).json({ message: "Log does not exist" })
        if (existingLog.userId !== userId)
        return res.status(401).json({ message: "You can only delete logs that you created" })

        if (!confirm)
        return res.status(200).json({ message: `Confirm deletion of ${existingLog.media.title} Log?` })

        await deleteLog(logId)
        res.status(200).json({ message: "Log deleted" })
    } catch (error) {
        if (error instanceof ZodError) {
        // return first validation error as JSON
            return res.status(400).json({
                message: error.issues[0]?.message || "Validation failed",
                errors: error.issues
            })
        }
        console.error(error)
        res.status(500).json({ message: "Failed to delete user log" })
    }
}