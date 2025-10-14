import express, { Application } from 'express'
import cors from 'cors'
import 'dotenv/config'
import { fileURLToPath } from 'url'
import path, { dirname } from 'path'

// Middleware
import { globalLimiter } from '@/middleWare/rateLimiter.js'
import authMiddleWare from '@/middleWare/authMiddleware.js'

import healthRoutes from '@/routes/healthRoutes.js'
import authRoutes from '@/routes/authRoutes.js'
import logRoutes from '@/routes/logRoutes.js'
import mediaRoutes from '@/routes/mediaRoutes.js'
import mediaTypeRoutes from '@/routes/mediaTypeRoutes.js'
import searchRoutes from '@/routes/searchRoutes.js'
import apiKeyRoutes from '@/routes/apiKeyRoutes.js'
import errorHandler from '@/middleWare/errorHandlerMiddleware.js'
import logger from '@/middleWare/loggingMiddleware.js'

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
        origin: ['http://localhost:5173', 'http://localhost'],
        credentials: true
    })
)

app.use(express.json())
if(process.env.NODE_ENV !== 'test'){
    app.use(globalLimiter())
    app.use(logger)
}


//Routes
app.use('/healthz', healthRoutes)
app.use('/auth', authRoutes)
app.use('/logs', authMiddleWare, globalLimiter(), logRoutes)
app.use('/media', authMiddleWare, globalLimiter(), mediaRoutes)
app.use('/media-type', authMiddleWare, globalLimiter(), mediaTypeRoutes)
app.use('/search', authMiddleWare, globalLimiter(), searchRoutes)
app.use('/api-key', authMiddleWare, globalLimiter(), apiKeyRoutes)


//Error handling
app.use(errorHandler)

export default app