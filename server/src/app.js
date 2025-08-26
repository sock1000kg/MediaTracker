import express from 'express'
import rateLimit,  { ipKeyGenerator } from 'express-rate-limit'
import cors from 'cors' //backend - frontend coms
import 'dotenv/config'

import {fileURLToPath} from 'url'
import path, { dirname } from 'path'

import authRoutes from './routes/authRoutes.js'
import logRoutes from './routes/logRoutes.js'
import mediaRoutes from './routes/mediaRoutes.js'
import mediaTypeRoutes from './routes/mediaTypeRoutes.js'
import authMiddleWare from './middleWare/authMiddleware.js'

const limiter = rateLimit({
    windowMs: 60*1000, //1 minute
    max: 30,
    keyGenerator: (req) => {
        if (req.userId) return req.userId
        return ipKeyGenerator(req)
    }, //Limit each user, fallback to IP if not logged in
    message: { error: 'Too many requests'}
})

const app = express()

//Middleware
app.use(cors({
    origin: "http://localhost:5173", //Vite dev server
    credentials: true
}))
app.use(express.json())
app.use(limiter)

//Serves Vite frontend when i have it eventually
//app.use(express.static(path.join(__dirname, '../../client/dist')))
// const __filename = fileURLToPath(import.meta.url) //get url to file
// const __dirname = dirname(__filename) //get the dir from file url (src)
// app.get('/', (req,res) => {
//     res.sendFile(path.join(__dirname, "..", "..", "client", "index.html"))
// })

//Routes
app.use('/auth', authRoutes)
app.use('/logs', authMiddleWare, logRoutes)
app.use('/media', authMiddleWare, mediaRoutes)
app.use('/media-type', authMiddleWare, mediaTypeRoutes)

export default app