import express from 'express'

import { 
    getAllLogs, 
    createLog, 
    findLogOfUserByMediaId, 
    findLogOfUserById,
    findMediaForUserById,
    findMediaTypeForUserOrGlobal
} from "./dbRoutes/dbRoutes.js";
import { sanitizeNotes, sanitizeRating, sanitizeStatus } from '../utilities.js';

const router = express.Router()

//Get all logs upon login
router.get('/', async (req,res) => {
    const userId = req.userId
    try {
        const logs = await getAllLogs(userId)
        console.log(logs)
        res.status(200).json(logs)
    } catch(error){
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch user log' });
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
        console.error(error);
        res.status(500).json({ error: 'Failed to create user log' });
    }
})

router.put('/:id', async (req,res) => {
    const { status, rating, notes } = req.body
    const id = parseInt(req.params.id)

    try{
        //Check if log exists for that id
        const existingLog = findLogOfUserById(id)
        if(!existingLog) return res.status(404).json({ error: 'Log does not exist'})

        
    }catch(error){

    }
})

export default router