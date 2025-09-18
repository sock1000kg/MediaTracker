import bcrypt from "bcryptjs"
import jwt from 'jsonwebtoken'
import {
  createUser,
  findUserByUsername
} from "@/controllers/dbCalls/authCalls"
import { findFirstMediaByTitle } from "./dbCalls/mediaCalls"
import { createLog } from "./dbCalls/logsCalls"

import type { NextFunction, Request, Response } from "express"

import { registerSchema, loginSchema } from "@/schemas/authSchemas"
import { validateSchema } from "@/utilities"

export const registerUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { username, password, displayName } = validateSchema(registerSchema, req.body)
        const hashedPassword = bcrypt.hashSync(password, 12)

        const user = await createUser(username, displayName, hashedPassword)

        // create default log for new users
        const defaultMedia = await findFirstMediaByTitle("Default Media")
        if (!defaultMedia) {
            return res.status(404).json({ message: "Default Media not found" })
        }

        await createLog(
            user.id,
            defaultMedia.id,
            "completed",
            100,
            "Welcome! This is your default log! Search up or create a custom media to log it!"
        )

        const token = jwt.sign(
            { id: user.id },
            process.env.JWT_KEY_SECRET as string,
            { expiresIn: "1h" }
        )

        res.json({ token, user })
    } catch (error: any) {
        next(error)
    }
}

export const loginUser = async (req: Request, res: Response, next: NextFunction) => {
    
    try {
        const { username, password } = validateSchema(loginSchema, req.body)

        const user = await findUserByUsername(username)
        
        const passwordIsValid = bcrypt.compareSync(password, user.password)

        if (!passwordIsValid) 
            return res.status(401).json({ message: "Invalid password" })

        const token = jwt.sign(
            { id: user.id },
            process.env.JWT_KEY_SECRET as string,
            { expiresIn: "1h" }
        )

        res.json({ token, user })
    } catch (error: any) {
        next(error)
    }
}
