import express from 'express'

import { getAllLogs, createLog, findLogOfUser } from "./dbRoutes/dbRoutes.js";

const router = express.Router()

//Get all logs upon login
router.get('/', async (req,res) => {

    try {
        const logs = await getAllLogs(req.userId)
        res.status(200).json(logs)
    } catch(error){
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch user log' });
    }
})

//Create a log
router.post('/', async (req,res) => {
    const { mediaId, status, rating, notes } = req.body

    try {
        //Check for existing log for the same media
        const existingLog = await findLogOfUser(req.userId, mediaId)
        if(existingLog) return res.status(409).json({ error: 'Your log of this media already exists'})

        const log = await createLog(req.userId, mediaId, status, rating, notes)
        res.status(201).json(log)
    } catch(error){
        console.error(error);
        res.status(500).json({ error: 'Failed to create user log' });
    }
})




export default router