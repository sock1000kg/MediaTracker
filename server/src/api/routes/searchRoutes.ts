import express from 'express'

import { searchBooks } from '@/api/controllers/searchControllers.js'

const router = express.Router()

router.get('/books', searchBooks)

export default router