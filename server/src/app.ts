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
import importRoutes from '@/api/routes/importRoutes.js'
import errorHandler from '@/middleWare/errorHandlerMiddleware.js'
import logger from '@/middleWare/loggingMiddleware.js'
import cookieParser from 'cookie-parser'
import { demoResetJob } from './jobs/resetDemoJob.js'

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

if (process.env.NODE_ENV !== 'test') {
    demoResetJob()
}

//Routes
const apiRouter = express.Router()

apiRouter.use('/healthz', healthRoutes)
apiRouter.use('/auth', authRoutes)
apiRouter.use('/logs', authMiddleWare, globalLimiter, logRoutes)
apiRouter.use('/media', authMiddleWare, globalLimiter, mediaRoutes)
apiRouter.use('/media-type', authMiddleWare, globalLimiter, mediaTypeRoutes)
apiRouter.use('/search', authMiddleWare, globalLimiter, searchRoutes)
apiRouter.use('/api-key', authMiddleWare, globalLimiter, apiKeyRoutes)
apiRouter.use('/imports', authMiddleWare, globalLimiter, importRoutes)

app.use('/api', apiRouter)

//Error handling
app.use(errorHandler)

export default app