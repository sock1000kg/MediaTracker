import express from 'express'
import { 
  getAllMediaTypes, 
  createMediaType, 
  deleteMediaType, 
  updateMediaType 
} from '@/controllers/mediaTypeControllers.js'

const router = express.Router()

// Fetch all media types for the current user
router.get('/', getAllMediaTypes)

// Create a new media type for the current user
router.post('/', createMediaType)

// Delete a media type (requires optional confirmation)
router.delete('/:name', deleteMediaType)

// Rename/update a media type
router.put('/:name', updateMediaType)

export default router
