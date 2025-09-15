import express, { Application } from 'express'
import cors from 'cors'
import 'dotenv/config'
import { fileURLToPath } from 'url'
import path, { dirname } from 'path'

// Middleware
import limiter from '@/middleWare/rateLimiter'
import authMiddleWare from '@/middleWare/authMiddleware'

import authRoutes from '@/routes/authRoutes'
import logRoutes from '@/routes/logRoutes'
import mediaRoutes from '@/routes/mediaRoutes'
import mediaTypeRoutes from '@/routes/mediaTypeRoutes'
import searchRoutes from '@/routes/searchRoutes'
import apiKeyRoutes from '@/routes/apiKeyRoutes'
import errorHandler from './middleWare/errorHandlerMiddleware'
import logger from './middleWare/loggingMiddleware'

const app: Application = express()


// Serves Vite frontend when i have it eventually
// app.use(express.static(path.join(__dirname, '../../client/dist')))
// const __filename = fileURLToPath(import.meta.url) // get url to file
// const __dirname = dirname(__filename) // get the dir from file url (src)
// app.get('/', (req: Request, res: Response) => {
//     res.sendFile(path.join(__dirname, "..", "..", "client", "index.html"))
// })
    
// Middleware
app.use(
    cors({
        origin: "http://localhost:5173", // Vite dev server
        credentials: true
    })
)
app.use(limiter())
app.use(express.json())
app.use(logger)

//Routes
app.use('/auth', authRoutes)
app.use('/logs', authMiddleWare, logRoutes)
app.use('/media', authMiddleWare, mediaRoutes)
app.use('/media-type', authMiddleWare, mediaTypeRoutes)
app.use('/search', authMiddleWare, searchRoutes)
app.use('/api-key', authMiddleWare, apiKeyRoutes)

//Error handling
app.use(errorHandler)

export default app