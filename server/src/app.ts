import express, { Request, Response, Application } from 'express'
import rateLimit, { RateLimitRequestHandler, ipKeyGenerator } from 'express-rate-limit'
import cors from 'cors'
import 'dotenv/config'
import { fileURLToPath } from 'url'
import path, { dirname } from 'path'

import authRoutes from '@/routes/authRoutes'
import logRoutes from '@/routes/logRoutes'
import mediaRoutes from '@/routes/mediaRoutes'
import mediaTypeRoutes from '@/routes/mediaTypeRoutes'
import authMiddleWare from '@/middleWare/authMiddleware'

const limiter: RateLimitRequestHandler = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30,
    keyGenerator: (req) => {
        if (req.userId !== null) return String(req.userId) // convert number -> string
        if (req.ip !== undefined) return ipKeyGenerator(req.ip)
        return ipKeyGenerator('unknown')
    },
    message: { error: 'Too many requests' }
})

const app: Application = express()

// Middleware
app.use(cors({
    origin: "http://localhost:5173", // Vite dev server
    credentials: true
}))
app.use(express.json())
app.use(limiter)

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

export default app