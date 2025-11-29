import express from 'express'

import { searchAlbums, searchBooks, searchTracks } from '@/api/controllers/searchControllers.js'

const router = express.Router()

router.get('/books', searchBooks)
router.get('/music/albums', searchAlbums)
router.get('/music/tracks', searchTracks)

export default router