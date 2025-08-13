import express from 'express'

import { getAllMediaTypes, findMediaTypeForUser, createMediaType } from './dbRoutes/dbRoutes.js'

const router = express.Router()

function normalizeTypeName(name) {
    return name.trim().toLowerCase().replace(/s$/, ""); // crude singularization
}

//Fetch all media types for this user
router.get('/', async (req,res) => {
    try {
        const logs = await getAllMediaTypes(req.userId)
        res.status(200).json(logs)
    } catch(error){
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch user media types' });
    }
})

//Make a new media type tied to this user
router.post('/', async (req,res) => {
    const {name} = req.body
    const normalizedName = normalizeTypeName(name)

    try{
        const existingMediaType = await findMediaTypeForUser(normalizedName, req.userId)
        if(existingMediaType) return res.status(409).json({ error: "Media Type already exists"})

        const mediaType = await createMediaType(normalizedName, req.userId)
        res.status(201).json(mediaType)
    }catch(error){
        console.log(error)
        res.status(500).json({ message: "Failed to create Media Type" });
    }
})
export default router