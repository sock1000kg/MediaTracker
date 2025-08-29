import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

import { createUser, findFirstMediaByTitle, createLog, findUserByUsername } from './dbRoutes/dbRoutes.js'
import { checkPasswordStrength, sanitizeUsername, sanitizeDisplayName } from '../utilities.js'


const router = express.Router()

router.post('/register', async (req,res) => {
    const {username: rawUsername, password, displayName: rawDisplayName} = req.body
    console.log(req.body)

    const username = sanitizeUsername(rawUsername)
    const displayName = sanitizeDisplayName(rawDisplayName)
    if(!username || !password || !displayName) return res.status(400).json({ message: 'Invalid input' })
    
    if(!checkPasswordStrength(password)) return res.status(400).json({ message: "Password must contain at least 8 characters, includingg 1 uppercase, 1 lowercase, 1 number, 1 special"})
    const hashedPassword = bcrypt.hashSync(password, 12)


    try{
        const user = await createUser(username, displayName, hashedPassword)

    //Find the default media in db to create default log for new users
        const defaultMedia = await findFirstMediaByTitle("Default Media")

        if(!defaultMedia) return res.status(404).json({message: "Default Media not found"})
        const defaultLog = await createLog(user.id, defaultMedia.id, "completed", 100, "Welcome! This is your default entry :)")
        console.log(defaultLog)

    //Create user token
        const token = jwt.sign({id: user.id}, process.env.JWT_KEY_SECRET, {expiresIn: '1h'})
        res.json({token, user})
    } catch (error){
        if (error.message === 'Username already taken') {
            return res.status(400).json({ message: 'Username already taken' });
        }
        console.log(error.message)
        res.sendStatus(503)
    }
})

router.post('/login', async (req,res) => {
    const {username, password} = req.body
    if(!username || !password) return res.status(400).json({ message: 'Invalid input' })

    try{
        const user = await findUserByUsername(username)

        const passwordIsValid = bcrypt.compareSync(password, user.password)
        if(!passwordIsValid) return res.status(401).send({ message: "Invalid password" })
        console.log(user)

        const token = jwt.sign({ id: user.id }, process.env.JWT_KEY_SECRET, { expiresIn: '1h' })
        res.json({token, user})
    }catch(error){
        if(error.message == 'Cannot find user') {
            return res.status(404).send({message: 'Cannot find user'})
        }
        console.log(error.message)
        res.sendStatus(503)
    }
})

export default router