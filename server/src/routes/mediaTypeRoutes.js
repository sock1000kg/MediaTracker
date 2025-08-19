import express from 'express'
import { normalizeTypeName } from '../utilities.js'

import { 
    getAllMediaTypesForUser, 
    findMediaTypeForUserOrGlobal, 
    findMediaTypeForUser,
    createMediaTypeForUser, 
    deleteMediaTypeForUser, 
    updateMediaTypeForUser 
} from './dbRoutes/dbRoutes.js'

const router = express.Router()

//Fetch all media types for this user
router.get('/', async (req,res) => {
    const userId = req.userId
    try {
        const logs = await getAllMediaTypesForUser(userId)
        res.status(200).json(logs)
    } catch(error){
        console.error(error)
        res.status(500).json({ error: 'Failed to fetch user media types' })
    }
})

//Make a new media type tied to this user
router.post('/', async (req,res) => {
    const {name} = req.body
    const userId = req.userId

    if(!name || !name.trim()) {
        return res.status(400).json({ error: "Name is required" })
    }

    const normalizedName = normalizeTypeName(name) // Normalize after check input
    try{
        const existingMediaType = await findMediaTypeForUserOrGlobal(normalizedName, userId)
        if(existingMediaType) return res.status(409).json({ error: "Media Type already exists"})

        const mediaType = await createMediaTypeForUser(normalizedName, userId)
        res.status(201).json(mediaType)
    }catch(error){
        console.log(error)
        res.status(500).json({ message: "Failed to create Media Type" })
    }
})

//Delete media type if it belongs to user
router.delete('/:name', async (req,res) => {
    const name = decodeURIComponent(req.params.name) //to avoid weird syntax in params
    const userId = req.userId
    const normalizedName = normalizeTypeName(name)
    const {confirm} = req.body  //boolean
    
    try{
        const existingMediaType = await findMediaTypeForUser(normalizedName, userId)
        if(!existingMediaType) return res.status(404).json({ error: "Media Type does not exist (You can only delete types that you created)"})

        if(existingMediaType.media.length > 0 && !confirm) return res.status(400).json({ 
            message: `Deleting this media will also delete ${existingMediaType.media.length} media(s) and all logs tied to them. Confirm deletion?`,
            mediaCount: existingMediaType.media.length
        })

        await deleteMediaTypeForUser(normalizedName, userId)
        res.status(200).json({message: "Media Type deleted successfully"})
    }catch(error){
        console.log(error)
        res.status(500).json({ message: "Failed to delete Media Type" })
    }
})

// Change media type name if it belongs to user
router.put('/:name', async (req,res) => {
    const name = decodeURIComponent(req.params.name) //to avoid weird syntax in params
    const {newName} = req.body
    const userId = req.userId
    
    if(!newName || !newName.trim()) {
        return res.status(400).json({ error: "Name is required" })
    }
    
    const normalizedOldName = normalizeTypeName(name)
    const normalizedNewName = normalizeTypeName(newName)
    try{
        //Check if mediaType belongs to user
        const existingOldMediaType = await findMediaTypeForUserOrGlobal(normalizedOldName, userId)
        if(!existingOldMediaType) return res.status(404).json({ error: "Media Type does not exist (You can only rename types that you created)"})
        
        //Check if new mediaType already exists
        const existingNewMediaType = await findMediaTypeForUserOrGlobal(normalizedNewName, userId)
        if(existingNewMediaType) return res.status(409).json({ error: "Media Type with that name already exists", existingNewMediaType})

        const updated = await updateMediaTypeForUser(normalizedOldName, normalizedNewName, userId)
        return res.status(200).json(updated)
    }catch(error){
        console.log(error)
        res.status(500).json({ message: "Failed to update Media Type" })
    }
})
export default router