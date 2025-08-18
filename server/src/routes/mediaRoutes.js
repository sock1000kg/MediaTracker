import express from 'express'
import { normalizeTypeName } from '../utilities.js'

import { 
    createMedia, 
    findMediaForUser, 
    findMediaById, 
    findMediaTypeForUserOrGlobal, 
    getAllMediasForUser, 
    updateMediaForUser, 
    deleteMediaForUser
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
    const {title, mediaType, creator, year, metadata} = req.body
    const userId = req.userId
    const normalizedTypeName = normalizeTypeName(mediaType.name)

    try{
        //Check if type exists for user
        const existingType = await findMediaTypeForUserOrGlobal(normalizedTypeName, userId)
        if(!existingType) return res.status(404).json({ error: "Media Type does not exists"})

        //Check if media exists for this user (global or user-added)
        const existingMedia = await findMediaForUser(title, existingType, creator, year, metadata, userId) 
        if(existingMedia) return res.status(409).json({ error: "Media already exists", existingMedia})
        

        const media = await createMedia(title, existingType, creator, year, metadata, userId)
        res.status(201).json(media)
    }catch(error){
        console.log(error)
        res.status(500).json({ message: "Failed to create media" });
    }
})

router.delete('/:id', async (req,res) => {
    const id = parseInt(decodeURIComponent(req.params.id))
    const userId = req.userId
    const {confirm} = req.body  //boolean

    try{
        const media = await findMediaById(id)

        if(!media) return res.status(404).json({ error: "Media not found"})
        if(media.userId !== userId) return res.status(403).json({ error: "You do not own this media" });

        //If there are logs for this media, prompt for confirmation
        if(media.logs.length !== 0 && !confirm) return res.status(400).json({ 
            message: `Deleting this media will also delete ${media.logs.length} log(s). Confirm deletion?`,
            logsCount: media.logs.length
        })

        await deleteMediaForUser(id)
        res.status(200).json({ message: "Media deleted" });

    }catch(error){
        console.log(error)
        res.status(500).json({ message: "Failed to delete media"})
    }
})

router.put('/:id', async (req,res) => {
    const id = parseInt(decodeURIComponent(req.params.id))
    const userId = req.userId
    const {
        title: newTitle,
        mediaType: newMediaType,
        creator: newCreator,
        year: newYear,
        metadata: newMetadata
        } = req.body;

    if(!newTitle || !newTitle.trim() || !newMediaType) {
        return res.status(400).json({ error: "Title and Media Type is required" });
    }
    
    const normalizedTypeName = normalizeTypeName(newMediaType.name)

    try{
        //Check if this media exists or belongs to the user
        const existing = await findMediaById(id)
        if (!existing) return res.status(404).json({ error: "Media not found" });
        if (existing.userId !== userId) return res.status(403).json({ error: "You do not own this media" });
        
        //Check if new type exists for user
        const existingType = await findMediaTypeForUserOrGlobal(normalizedTypeName, userId)
        if(!existingType) return res.status(404).json({ error: "Media Type does not exists"})

        //Check if new media exists for this user (global or user-added)
        const existingMedia = await findMediaForUser(newTitle, existingType, newCreator, newYear, newMetadata, userId) 
        if(existingMedia) return res.status(409).json({ error: "Media already exists", existingMedia})


        const updated = await updateMediaForUser(newTitle, existingType, newCreator, newYear, newMetadata, userId, id)
        res.status(200).json(updated)
    }catch(error){
        console.log(error)
        res.status(500).json({ message: "Failed to edit media" });
    }

})

export default router