import bcrypt from "bcryptjs"
import jwt from 'jsonwebtoken'
import {
  createUser,
  findFirstMediaByTitle,
  createLog,
  findUserByUsername
} from "@/controllers/dbCalls/dbControllers"

import type { Request, Response } from "express"

import { z } from "zod"
import { registerSchema, loginSchema } from "@/schemas/authSchemas"

export const registerUser = async (req: Request, res: Response) => {
    const parsed = registerSchema.safeParse(req.body)
        if (!parsed.success) {
            const firstError = parsed.error.issues[0]?.message || "Validation failed"
            return res.status(400).json({
                message: firstError,
                errors: z.treeifyError(parsed.error)
            })
        }
    const { username, password, displayName } = parsed.data

    const hashedPassword = bcrypt.hashSync(password, 12)

    try {
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
        console.error(error.message)
        res.sendStatus(503)
    }
}

export const loginUser = async (req: Request, res: Response) => {
    const parsed = loginSchema.safeParse(req.body)
        if (!parsed.success) {
            const firstError = parsed.error.issues[0]?.message || "Validation failed"
            return res.status(400).json({
                message: firstError,
                errors: z.treeifyError(parsed.error)
            })
        }

    const { username, password } = parsed.data

    try {
        const user = await findUserByUsername(username)
        const passwordIsValid = bcrypt.compareSync(password, user.password)

        if (!passwordIsValid) {
            return res.status(401).json({ message: "Invalid password" })
        }

        const token = jwt.sign(
            { id: user.id },
            process.env.JWT_KEY_SECRET as string,
            { expiresIn: "1h" }
        )

        res.json({ token, user })
    } catch (error: any) {
        if (error.message === "Cannot find user") {
            return res.status(404).json({ message: "Cannot find user" })
        }
        console.error(error.message)
        res.sendStatus(503)
    }
}
