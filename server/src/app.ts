import express, { Application } from 'express'
import { limiter } from '@/middleWare/rateLimiter'
import cors from 'cors'
import 'dotenv/config'
import { fileURLToPath } from 'url'
import path, { dirname } from 'path'

import authRoutes from '@/routes/authRoutes'
import logRoutes from '@/routes/logRoutes'
import mediaRoutes from '@/routes/mediaRoutes'
import mediaTypeRoutes from '@/routes/mediaTypeRoutes'
import authMiddleWare from '@/middleWare/authMiddleware'
import searchRoutes from '@/routes/searchRoutes'
import apiKeyRoutes from '@/routes/apiKeyRoutes'

const app: Application = express()

// Middleware
app.use(cors({
    origin: "http://localhost:5173", // Vite dev server
    credentials: true
}))
app.use(limiter)
app.use(express.json())

// Serves Vite frontend when i have it eventually
// app.use(express.static(path.join(__dirname, '../../client/dist')))
// const __filename = fileURLToPath(import.meta.url) // get url to file
// const __dirname = dirname(__filename) // get the dir from file url (src)
// app.get('/', (req: Request, res: Response) => {
//     res.sendFile(path.join(__dirname, "..", "..", "client", "index.html"))
// })

//Routes
app.use('/auth', authRoutes)
app.use('/logs', authMiddleWare, logRoutes)
app.use('/media', authMiddleWare, mediaRoutes)
app.use('/media-type', authMiddleWare, mediaTypeRoutes)
app.use('/search', authMiddleWare, searchRoutes)
app.use('/api-key', authMiddleWare, apiKeyRoutes)

export default app