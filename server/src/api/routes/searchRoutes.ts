import express from 'express'

import {
    getTvSeasons,
    searchAlbums,
    getAlbumTracks,
    searchAnime,
    searchBooks,
    searchGames,
    searchManga,
    searchMovies,
    searchTracks,
    searchTv,
} from '@/api/controllers/searchControllers.js'

const router = express.Router()

router.get('/books', searchBooks)
router.get('/music/albums', searchAlbums)
router.get('/music/albums/tracks', getAlbumTracks)
router.get('/music/tracks', searchTracks)
router.get('/anime', searchAnime)
router.get('/manga', searchManga)
router.get('/movies', searchMovies)
router.get('/tv', searchTv)
router.get('/tv/:tmdbId/seasons', getTvSeasons)
router.get('/games', searchGames)

export default router