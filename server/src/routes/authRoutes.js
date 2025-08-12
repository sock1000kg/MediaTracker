import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

import { createUser, findFirstMediaByTitle, createLog, findUserByUsername } from './dbRoutes/dbRoutes.js'


const router = express.Router()

router.post('/register', async (req,res) => {
    const {username, password} = req.body
    if(!username || !password) return res.status(400).json({ error: 'Invalid input' })
    const hashedPassword = bcrypt.hashSync(password, 12)

    try{
        const user = await createUser(username, hashedPassword)

    //Find the default media in db to create default log for new users
        const defaultMedia = await findFirstMediaByTitle("Default Media")

        if(!defaultMedia) throw new Error("Default Media not found")
        const defaultLog = await createLog(user.id, defaultMedia.id, "Completed", 100, "Welcome! This is your default entry :)")
        console.log(defaultLog)

    //Create user token
        const token = jwt.sign({id: user.id}, process.env.JWT_KEY_SECRET, {expiresIn: '1h'})
        res.json({token, user})
    } catch (error){
        if (error.message === 'Username already taken') {
            return res.status(400).json({ error: 'Username already taken' });
        }
        console.log(error.message)
        res.sendStatus(503)
    }
})

router.post('/login', async (req,res) => {
    const {username, password} = req.body
    if(!username || !password) return res.status(400).json({ error: 'Invalid input' })

    try{
        const user = await findUserByUsername(username)

        const passwordIsValid = bcrypt.compareSync(password, user.password)
        if(!passwordIsValid) return res.status(401).send({ error: "Invalid password" })
        console.log(user)

        const token = jwt.sign({ id: user.id }, process.env.JWT_KEY_SECRET, { expiresIn: '1h' })
        res.json({token, user})
    }catch(error){
        if(error.message == 'Cannot find user') {
            return res.status(404).send({error: 'Cannot find user'})
        }
        console.log(error.message)
        res.sendStatus(503)
    }
})

export default router