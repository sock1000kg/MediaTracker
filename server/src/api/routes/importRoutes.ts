import express from 'express'
import multer from 'multer'
import { importGoodReads, importMal, importLetterboxd } from '../controllers/importController.js'

export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024

const router = express.Router()
// Size is enforced while streaming the upload, so an oversized body is never buffered.
// LIMIT_FILE_SIZE is mapped to a 400 by errorHandlerMiddleware.
const upload = multer({ limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 1 } })

//import medias from goodreads and log them
router.post('/goodreads', upload.single('file'), importGoodReads)

//import anime and manga from MyAnimeList and log them
router.post('/mal', upload.single('file'), importMal)

//import movies from Letterboxd and log them
router.post('/letterboxd', upload.single('file'), importLetterboxd)

export default router
