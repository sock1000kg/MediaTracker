import express from 'express'

import { 
    getAllLogs, 
    createLog, 
    findLogOfUserByMediaId, 
    findLogById,
    findMediaForUserById,
    findMediaTypeForUserOrGlobal,
    updateLog,
    deleteLog
} from "./dbRoutes/dbRoutes.js"
import { sanitizeNotes, sanitizeRating, sanitizeStatus } from '../utilities.js'

const router = express.Router()

//Get all logs upon login
router.get('/', async (req,res) => {
    const userId = req.userId
    try {
        const logs = await getAllLogs(userId)
        console.log(logs)
        res.status(200).json(logs)
    } catch(error){
        console.error(error)
        res.status(500).json({ error: 'Failed to fetch user log' })
    }
})

//Create a log
//User can only log a media they created or a global one
router.post('/', async (req,res) => {
    const { mediaId, status: rawStatus, rating: rawRating, notes: rawNotes } = req.body
    const userId = req.userId

    if(!mediaId) return res.status(400).json({ error: 'Log needs a media'})

    //Sanitization
    const status = sanitizeStatus(rawStatus)

    const rating = sanitizeRating(rawRating)

    const notes = sanitizeNotes(rawNotes)

    try {
        //Check for existing log of the same media
        const existingLog = await findLogOfUserByMediaId(userId, mediaId)
        if(existingLog) return res.status(409).json({ error: 'Your log of this media already exists'})
            
        //Check if this media exists for user (global/user-added)
        const media = await findMediaForUserById(mediaId, userId)
        if(!media) return res.status(404).json({ error: 'Media does not exist or you do not own it'})
            
        //Check if user has the media's type, if not create a new type
        const mediaType = await findMediaTypeForUserOrGlobal(media.mediaType.name, userId)
        if(!mediaType) mediaType = await createMediaTypeForUser(media.mediaType.name, userId) 

        const log = await createLog(userId, mediaId, status, rating, notes)
        res.status(201).json(log)
    } catch(error){
        console.error(error)
        res.status(500).json({ error: 'Failed to create user log' })
    }
})

//Updates a log
router.put('/:id', async (req,res) => {
    const { status: rawStatus, rating: rawRating, notes: rawNotes } = req.body
    const userId = req.userId
    const logId = parseInt(req.params.id)

    //Sanitization
    const newStatus = sanitizeStatus(rawStatus)

    const newRating = sanitizeRating(rawRating)

    const newNotes = sanitizeNotes(rawNotes)
    try{
        //Check if log exists or belong to that user id
        const existingLog = await findLogById(logId)
        if(!existingLog) return res.status(404).json({ error: 'Log does not exist'})
        if(existingLog.userId !== userId) return res.status(401).json({ error: 'You do not own this log'})

        const updated = await updateLog(logId, newStatus, newRating, newNotes)
        return res.status(200).json(updated)
    }catch(error){
        console.error(error)
        res.status(500).json({ error: 'Failed to update user log' })
    }
})

//Deletes log
router.delete('/:id', async (req,res) => {
    const logId = parseInt(req.params.id)
    const userId = req.userId

    try{
        //Check if log exists or belong to user
        const existingLog = await findLogById(logId)
        if(!existingLog) return res.status(404).json({ error: 'Log does not exist'})
        if(existingLog.userId !== userId) return res.status(401).json({ error: 'You do not own this log'})

        await deleteLog(logId)
        res.status(200).json({ message: 'Log deleted' })
    }catch(error) {
        console.error(error)
        res.status(500).json({ error: 'Failed to delete user log' })
    }
})

export default router