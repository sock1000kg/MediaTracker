import express from 'express'
import {
  getMedias,
  createNewMedia,
  updateExistingMedia,
  deleteExistingMedia,
  createMediaAndLog
} from '@/api/controllers/mediaController.js'

const router = express.Router()

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


export default router
