import express from 'express'

import { createMediaAndLog, searchBooks } from '@/controllers/searchControllers.js'

const router = express.Router()

router.put('/media-log', createMediaAndLog)

router.get('/books', searchBooks)

export default router