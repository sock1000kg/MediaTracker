import express, { Application } from 'express'
import cors from 'cors'
import helmet from "helmet"
import 'dotenv/config'

// Middleware
import {globalLimiter} from '@/middleWare/rateLimiter.js'
import authMiddleWare from '@/middleWare/authMiddleware.js'

import healthRoutes from '@/api/routes/healthRoutes.js'
import authRoutes from '@/api/routes/authRoutes.js'
import logRoutes from '@/api/routes/logRoutes.js'
import mediaRoutes from '@/api/routes/mediaRoutes.js'
import mediaTypeRoutes from '@/api/routes/mediaTypeRoutes.js'
import searchRoutes from '@/api/routes/searchRoutes.js'
import apiKeyRoutes from '@/api/routes/apiKeyRoutes.js'
import errorHandler from '@/middleWare/errorHandlerMiddleware.js'
import logger from '@/middleWare/loggingMiddleware.js'
import cookieParser from 'cookie-parser'

const app: Application = express()

app.set('trust proxy', 1)

// Middleware
app.use(helmet())
app.use(cookieParser())

app.use(
    cors({
        origin: ['http://localhost:5173', 'http://localhost'],
        credentials: true
    })
)

app.use(express.json())
app.use(globalLimiter)
app.use(logger)


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