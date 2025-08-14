import express from 'express'

import { createMedia, findMedia } from './dbRoutes/dbRoutes.js'

const router = express.Router()


function normalizeTypeName(name) {
    return name.trim().toLowerCase().replace(/s$/, ""); // crude singularization
}

//USER CREATED MEDIA DATA
router.post('/', async (req,res) => {
    const {title, mediaType, creator, year, metadata} = req.body
    const normalizedName = normalizeTypeName(mediaType.name)

    try{
        const existingMedia = await findMedia(title, normalizedName, creator, year, metadata, req.userId)
        if(existingMedia) return res.status(409).json({ error: "Media already exists"})

        const media = await createMedia(title, normalizedName, creator, year, metadata)
        res.status(201).json(media)
    }catch(error){
        console.log(error)
        res.status(500).json({ message: "Failed to create media" });
    }
})

export default router