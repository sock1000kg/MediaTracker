import express from 'express'

import { getAllMediaTypesForUser, findMediaTypeForUser, createMediaTypeForUser, deleteMediaTypeForUser, updateMediaTypeForUser } from './dbRoutes/dbRoutes.js'

const router = express.Router()

function normalizeTypeName(name) {
    return name.trim().toLowerCase().replace(/s$/, ""); // crude singularization
}

//Fetch all media types for this user
router.get('/', async (req,res) => {
    try {
        const logs = await getAllMediaTypesForUser(req.userId)
        res.status(200).json(logs)
    } catch(error){
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch user media types' });
    }
})

//Make a new media type tied to this user
router.post('/', async (req,res) => {
    const {name} = req.body
    const userId = req.userId

    if(!name || !name.trim()) {
        return res.status(400).json({ error: "Name is required" });
    }

    const normalizedName = normalizeTypeName(name)
    try{
        const existingMediaType = await findMediaTypeForUser(normalizedName, userId)
        if(existingMediaType) return res.status(404).json({ error: "Media Type already exists"})

        const mediaType = await createMediaTypeForUser(normalizedName, req.userId)
        res.status(201).json(mediaType)
    }catch(error){
        console.log(error)
        res.status(500).json({ message: "Failed to create Media Type" });
    }
})

//Delete media type if it belongs to user
router.delete('/:name', async (req,res) => {
    const name = decodeURIComponent(req.params.name); //to avoid weird syntax in params
    const userId = req.userId
    const normalizedName = normalizeTypeName(name)
    
    try{
        const existingMediaType = await findMediaTypeForUser(normalizedName, userId)
        if(!existingMediaType) return res.status(404).json({ error: "Media Type does not exist (You can only delete types that you created)"})

        await deleteMediaTypeForUser(normalizedName, userId)
        res.status(200).json({message: "Media Type deleted successfully"})
    }catch(error){
        console.log(error)
        res.status(500).json({ message: "Failed to delete Media Type" });
    }
})

// Change media type name if it belongs to user
router.put('/:name', async (req,res) => {
    const name = decodeURIComponent(req.params.name); //to avoid weird syntax in params
    const {newName} = req.body
    const userId = req.userId
    
    if(!newName || !newName.trim()) {
        return res.status(400).json({ error: "Name is required" });
    }
    
    const normalizedOldName = normalizeTypeName(name)
    const normalizedNewName = normalizeTypeName(newName)
    try{
        const existingOldMediaType = await findMediaTypeForUser(normalizedOldName, userId)
        if(!existingOldMediaType) return res.status(404).json({ error: "Media Type does not exists (You can only rename types that you created)"})

        const existingNewMediaType = await findMediaTypeForUser(normalizedNewName, userId)
        if(existingNewMediaType) return res.status(404).json({ error: "Media Type with that name already exists"})

        const updated = await updateMediaTypeForUser(normalizedOldName, normalizedNewName, userId)
        return res.status(200).json(updated)
    }catch(error){
        console.log(error)
        res.status(500).json({ message: "Failed to update Media Type" });
    }
})
export default router