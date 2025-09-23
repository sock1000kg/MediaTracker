import express from 'express'
import {
  getMedias,
  createNewMedia,
  updateExistingMedia,
  deleteExistingMedia
} from '@/controllers/mediaController.js'

const router = express.Router()

// Get all medias for the user
router.get('/', getMedias)

// create new media
router.post('/', createNewMedia)

// update media by id
router.put('/:id', updateExistingMedia)

// delete media by id
router.delete('/:id', deleteExistingMedia)

export default router
