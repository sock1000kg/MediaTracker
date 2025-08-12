import express from 'express'
import cors from 'cors' //backend - frontend coms
import 'dotenv/config'

import {fileURLToPath} from 'url'
import path, { dirname } from 'path'

import authRoutes from './routes/authRoutes.js'
import logRoutes from './routes/logRoutes.js'
import mediaRoutes from './routes/mediaRoutes.js'
import authMiddleWare from './middleWare/authMiddleware.js'

const app = express()
const PORT = process.env.PORT || 5003

const __filename = fileURLToPath(import.meta.url) //get url to file
const __dirname = dirname(__filename) //get the dir from file url (src)

app.use(express.json())

//Serves Vite frontend when i have it eventually
//app.use(express.static(path.join(__dirname, '../../client/dist')))

app.get('/', (req,res) => {
    res.sendFile(path.join(__dirname, "..", "..", "client", "index.html"))
    console.log("Server started on port: " + PORT)
})

//Routes
app.use('/auth', authRoutes)
app.use('/logs', authMiddleWare, logRoutes)
app.use('/media', authMiddleWare, mediaRoutes)

app.listen(PORT, () => {
    console.log(`Server has started on port: ${PORT}, DB_URL: ${process.env.DATABASE_URL}`)
})