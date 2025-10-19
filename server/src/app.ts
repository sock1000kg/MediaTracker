import express, { Application } from 'express'
import cors from 'cors'
import helmet from "helmet"
import 'dotenv/config'

// Middleware
import {globalLimiter} from '@/middleWare/rateLimiter.js'
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
    
// Middleware
app.use(helmet())

app.use(
    cors({
        origin: ['http://localhost:5173', 'http://localhost'],
        credentials: true
    })
)

app.use(express.json())
if(process.env.NODE_ENV !== 'test'){
    app.use(globalLimiter)
    app.use(logger)
}


//Routes
app.use('/healthz', healthRoutes)
app.use('/auth', authRoutes)
app.use('/logs', authMiddleWare, globalLimiter, logRoutes)
app.use('/media', authMiddleWare, globalLimiter, mediaRoutes)
app.use('/media-type', authMiddleWare, globalLimiter, mediaTypeRoutes)
app.use('/search', authMiddleWare, globalLimiter, searchRoutes)
app.use('/api-key', authMiddleWare, globalLimiter, apiKeyRoutes)


//Error handling
app.use(errorHandler)

export default app