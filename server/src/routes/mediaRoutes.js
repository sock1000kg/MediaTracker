import express from 'express'
import { normalizeTypeName, sanitizeCreator, sanitizeMetadata, sanitizeTitle, sanitizeYear } from '../utilities.js'

import { 
    createMedia, 
    findMediaForUser, 
    findMediaById, 
    findMediaTypeForUserOrGlobal, 
    getAllMediasForUser, 
    updateMediaForUser, 
    deleteMedia
} from './dbRoutes/dbRoutes.js'

const router = express.Router()



//Get all media data tied to user
router.get('/', async (req,res) => {
    const userId = req.userId

    try {
        const medias = await getAllMediasForUser(userId)
        res.status(200).json(medias)
    }catch(error){
        console.log(error)
        res.status(500).json({ message: "Failed to fetch media" })
    }
})

//Create a media data tied to user
router.post('/', async (req,res) => {
    const {title: rawTitle, mediaType, creator: rawCreator, year: rawYear, metadata: rawMetadata} = req.body
    const userId = req.userId

    //Sanitization
    const title = sanitizeTitle(rawTitle)
    if(!title || !title.trim() || !mediaType) return res.status(400).json({ message: "Title and Media Type is required" })

    const creator = sanitizeCreator(rawCreator)

    const metadata = sanitizeMetadata(rawMetadata)

    const year = sanitizeYear(rawYear)
    if (rawYear != null && year === null) return res.status(400).json({ message: "Year must be a number" })

    const normalizedTypeName = normalizeTypeName(mediaType.name)

    try{
        //Check if type exists for user
        const existingType = await findMediaTypeForUserOrGlobal(normalizedTypeName, userId)
        if(!existingType) return res.status(404).json({ message: "Media Type does not exists"})

        //Check if media exists for this user (global or user-added)
        const existingMedia = await findMediaForUser(title, existingType, creator, year, metadata, userId) 
        if(existingMedia) return res.status(409).json({ message: "Media already exists", existingMedia})
        

        const media = await createMedia(title, existingType, creator, year, metadata, userId)
        res.status(201).json(media)
    }catch(error){
        console.log(error)
        res.status(500).json({ message: "Failed to create media" });
    }
})

//Delete a media tied to user
router.delete('/:id', async (req,res) => {
    const id = parseInt(decodeURIComponent(req.params.id))
    const userId = req.userId
    const {confirm} = req.body  //boolean

    try{
        const media = await findMediaById(id)

        if(!media) return res.status(404).json({ message: "Media not found"})
        if(media.userId !== userId) return res.status(403).json({ message: "You do not own this media" });

        //If there are logs for this media, prompt for confirmation
        if(media.logs.length !== 0 && !confirm) return res.status(400).json({ 
            message: `Deleting this media will also delete ${media.logs.length} log(s). Confirm deletion?`,
            logsCount: media.logs.length
        })

        await deleteMedia(id)
        res.status(200).json({ message: "Media deleted" });

    }catch(error){
        console.log(error)
        res.status(500).json({ message: "Failed to delete media"})
    }
})

//Update media tied to user
router.put('/:id', async (req,res) => {
    const id = parseInt(decodeURIComponent(req.params.id))
    const userId = req.userId
    const {
        title: rawTitle,
        mediaType: rawMediaType,
        creator: rawCreator,
        year: rawYear,
        metadata: rawMetadata
        } = req.body;

    //Sanitization
    const newTitle = sanitizeTitle(rawTitle)
    if(!newTitle || !newTitle.trim() || !rawMediaType) return res.status(400).json({ message: "Title and Media Type is required" })

    const newCreator = sanitizeCreator(rawCreator)

    const newMetadata = sanitizeMetadata(rawMetadata)

    const newYear = sanitizeYear(rawYear)
    if (rawYear != null && newYear === null) return res.status(400).json({ message: "Year must be a number" })
    
    const normalizedTypeName = normalizeTypeName(rawMediaType.name)

    try{
        //Check if this media exists or belongs to the user
        const existing = await findMediaById(id)
        if (!existing) return res.status(404).json({ message: "Media not found" });
        if (existing.userId !== userId) return res.status(403).json({ message: "You do not own this media" });
        
        //Check if new type exists for user
        const existingType = await findMediaTypeForUserOrGlobal(normalizedTypeName, userId)
        if(!existingType) return res.status(404).json({ message: "Media Type does not exists"})

        //Check if new media exists for this user (global or user-added)
        const existingMedia = await findMediaForUser(newTitle, existingType, newCreator, newYear, newMetadata, userId) 
        if(existingMedia) return res.status(409).json({ message: "Media already exists", existingMedia})


        const updated = await updateMediaForUser(newTitle, existingType, newCreator, newYear, newMetadata, userId, id)
        res.status(200).json(updated)
    }catch(error){
        console.log(error)
        res.status(500).json({ message: "Failed to edit media" });
    }

})

export default router