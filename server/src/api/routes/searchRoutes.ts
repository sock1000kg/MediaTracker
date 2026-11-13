import express from 'express'

import { searchAlbums, searchAnime, searchBooks, searchGames, searchManga, searchMovies, searchTracks } from '@/api/controllers/searchControllers.js'

const router = express.Router()

router.get('/books', searchBooks)
router.get('/music/albums', searchAlbums)
router.get('/music/tracks', searchTracks)
router.get('/anime', searchAnime)
router.get('/manga', searchManga)
router.get('/movies', searchMovies)
router.get('/games', searchGames)

export default router