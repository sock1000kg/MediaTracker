import express from 'express'

import { createMedia, findMedia } from './dbRoutes/dbRoutes.js'

const router = express.Router()

//USER CREATED MEDIA DATA
router.post('/', async (req,res) => {
    const {title, type, creator, year, metadata} = req.body

    try{
        const existingMedia = await findMedia(title, type, creator, year, metadata)
        if(existingMedia) return res.status(409).json({ error: "Media already exists"})

        const media = await createMedia(title, type, creator, year, metadata)
        res.status(201).json(media)
    }catch(error){
        console.log(error)
        res.status(500).json({ message: "Failed to create media" });
    }
})

export default router