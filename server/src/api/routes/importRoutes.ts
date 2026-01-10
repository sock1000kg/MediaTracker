import express from 'express'
import multer from 'multer'
import { importGoodReads } from '../controllers/importController.js'

const router = express.Router()
const upload = multer()

//import medias from goodreads and log them
router.post('/goodreads', upload.single('file'), importGoodReads)

export default router