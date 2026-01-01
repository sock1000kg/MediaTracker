import express from 'express'
import {
  getMedias,
  createNewMedia,
  updateExistingMedia,
  deleteExistingMedia,
  createMediaAndLog,
  importGoodReads
} from '@/api/controllers/mediaController.js'
import multer from 'multer'

const router = express.Router()
const upload = multer()

// Get all medias for the user
router.get('/', getMedias)

// create new media
router.post('/', createNewMedia)

// create a new media when user wants to log things that they've searched
router.put('/media-log', createMediaAndLog)

// update media by id
router.put('/:id', updateExistingMedia)

// delete media by id
router.delete('/:id', deleteExistingMedia)

//import medias from goodreads and log them
router.post('/import-goodreads', upload.single('file'), importGoodReads)


export default router
