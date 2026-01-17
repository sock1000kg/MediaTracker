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

//ROUTES
const apiRouter = express.Router()

// Public
apiRouter.use('/healthz', healthRoutes)
apiRouter.use('/auth', authRoutes)

// Protected
const protectedRouter = express.Router()
protectedRouter.use(authMiddleWare, globalLimiter)
protectedRouter.use('/logs', logRoutes)
protectedRouter.use('/media', mediaRoutes)
protectedRouter.use('/media-type', mediaTypeRoutes)
protectedRouter.use('/search', searchRoutes)
protectedRouter.use('/api-key', apiKeyRoutes)
protectedRouter.use('/imports', importRoutes)

apiRouter.use('/', protectedRouter)
app.use(apiRouter)

//Error handling
app.use(errorHandler)

export default app