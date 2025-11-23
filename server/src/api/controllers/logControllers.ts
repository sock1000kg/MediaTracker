import { NextFunction, Request, Response } from "express"
import {
    getAllLogs,
    createLog,
    findLogOfUserByMediaId,
    findLogById,
    updateLog,
    deleteLog,
} from "@/repositories/logsRepository.js"
import { findMediaForUserById } from "@/repositories/mediaRepository.js"
import { findMediaTypeForUserOrGlobal, createMediaTypeForUser } from "@/repositories/mediaTypeRepository.js"

import { createLogSchema, deleteLogSchema, updateLogSchema } from "@/schemas/logSchemas.js"
import { validateSchema } from "@/utilities.js"

// Get all logs
export const getLogs = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (userId == null) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    try {
        const logs = await getAllLogs(userId)
        res.status(200).json(logs)
    } catch (error) {
        next(error)
    }
}

//Create a log
export const createNewLog = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (!userId) 
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    
    try {
        //Sanitization
        console.log("BODY RECEIVED:", req.body)
        const { mediaId, status, rating, notes } = validateSchema(createLogSchema, req.body)

        const existingLog = await findLogOfUserByMediaId(userId, mediaId)
        if (existingLog)
            return res.status(409).json({ message: "Your log of this media already exists" })

        //Check for media so you cant log sb else's media
        const media = await findMediaForUserById(mediaId, userId)
        if (!media) 
            return res.status(404).json({ message: "Media does not exist or you do not own it" })

        //Check for mediaType just to be sure frontend sending it correctly
        if (!media.mediaType) 
            return res.status(500).json({ message: "Media type is missing" })
        
        //Check if user have this type available, if not make one for them
        let mediaType = await findMediaTypeForUserOrGlobal(media.mediaType.name, userId)
        if (!mediaType) 
            mediaType = await createMediaTypeForUser(media.mediaType.name, userId)

        const log = await createLog(userId, mediaId, status, rating, notes)
        res.status(201).json(log)
    } catch (error) {
        next(error)
    }
}

//Update a log
export const updateExistingLog = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (!userId) 
        return res.status(401).json({ message: "Unauthorized: missing userId" })

    const logId = parseInt(req.params.id)
    if(!logId) 
        return res.status(400).json({ message: "Invalid params" })

        
    try {
        //Sanitization
        const { status: newStatus, rating: newRating, notes: newNotes } = validateSchema(updateLogSchema, req.body)

        const existingLog = await findLogById(logId)
        if (!existingLog)  
            return res.status(404).json({ message: "Log does not exist" })
        
        if (existingLog.userId !== userId)
            return res.status(401).json({ message: "You can only edit logs that you created" })

        const updated = await updateLog(logId, newStatus, newRating, newNotes)
        res.status(200).json(updated)
    } catch (error) {
        next(error)
    }
}


// Delete a log
export const deleteExistingLog = async (req: Request, res: Response, next: NextFunction) => {
    const userId = Number(req.userId)
    if (!userId) 
        return res.status(401).json({ message: "Unauthorized: missing userId" })
        
    const logId = parseInt(req.params.id)
    if(!logId) 
        return res.status(400).json({ message: "Invalid params" })
        
        
    try {
        //Sanitization
        const { confirm } = validateSchema(deleteLogSchema, req.body)

        const existingLog = await findLogById(logId)
        if (!existingLog) 
            return res.status(404).json({ message: "Log does not exist" })

        if (existingLog.userId !== userId)
            return res.status(401).json({ message: "You can only delete logs that you created" })

        if (!confirm)
            return res.status(200).json({ message: `Confirm deletion of ${existingLog.media.title} Log?` })

        await deleteLog(logId)
        res.status(200).json({ message: "Log deleted" })
    } catch (error) {
        next(error)
    }
}