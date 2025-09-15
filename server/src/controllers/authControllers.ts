import bcrypt from "bcryptjs"
import jwt from 'jsonwebtoken'
import {
  createUser,
  findUserByUsername
} from "@/controllers/dbCalls/authCalls"
import { findFirstMediaByTitle } from "./dbCalls/mediaCalls"
import { createLog } from "./dbCalls/logsCalls"

import type { Request, Response } from "express"

import { z, ZodError } from "zod"
import { registerSchema, loginSchema } from "@/schemas/authSchemas"
import { validateSchema } from "@/utilities"

export const registerUser = async (req: Request, res: Response) => {
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
            "Welcome! This is your default entry :)"
        )

        const token = jwt.sign(
            { id: user.id },
            process.env.JWT_KEY_SECRET as string,
            { expiresIn: "1h" }
        )

        res.json({ token, user })
    } catch (error: any) {
        if (error.message === "Username already taken") {
            return res.status(400).json({ message: "Username already taken" })
        }
        
        if (error instanceof ZodError) {
        // return first validation error as JSON
            return res.status(400).json({
                message: error.issues[0]?.message || "Validation failed",
                errors: error.issues
            })
        }

        console.error(error.message)
        res.sendStatus(503)
    }
}

export const loginUser = async (req: Request, res: Response) => {
    
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
        if (error.message === "Cannot find user") 
            return res.status(404).json({ message: "Cannot find user" })

        if (error instanceof ZodError) {
        // return first validation error as JSON
            return res.status(400).json({
                message: error.issues[0]?.message || "Validation failed",
                errors: error.issues
            })
        }
        console.error(error.message)
        res.sendStatus(503)
    }
}
