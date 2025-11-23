import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { createUser, findUserByUsername } from "@/repositories/authRepository.js"
import { findFirstMediaByTitle } from "@/repositories/mediaRepository.js"
import { createLog } from "@/repositories/logsRepository.js"
import { registerSchema, loginSchema } from "@/schemas/authSchemas.js"
import { validateSchema } from "@/utilities.js"

export class AuthService {
    async register(payload: any) {
        const { username, password, displayName } = validateSchema(registerSchema, payload)

        const existingUser = await findUserByUsername(username)
        if (existingUser) {
            throw Object.assign(new Error("Username already taken"), { status: 400 })
        }
        
        const hashedPassword = bcrypt.hashSync(password, 12)
        const user = await createUser(username, displayName, hashedPassword)

        // Create a default log for new users
        const defaultMedia = await findFirstMediaByTitle("Default Media")
        if (!defaultMedia) {
            throw Object.assign(new Error("Default Media not found"), { status: 404 })
        }

        await createLog(
            user.id,
            defaultMedia.id,
            "completed",
            100,
            "Welcome! This is your default log! Search up or create a custom media to log it!"
        )

        // Generate JWT
        const token = jwt.sign(
            { id: user.id },
            process.env.JWT_KEY_SECRET as string,
            { expiresIn: "1h" }
        )

        return { token, user }
    }

    async login(payload: any) {
        const { username, password } = validateSchema(loginSchema, payload)

        const user = await findUserByUsername(username)
        if (!user) {
            throw Object.assign(new Error("Cannot find user"), { status: 404 })
        }

        const passwordIsValid = bcrypt.compareSync(password, user.password)
        if (!passwordIsValid) {
            throw Object.assign(new Error("Invalid password"), { status: 401 })
        }

        const token = jwt.sign(
            { id: user.id },
            process.env.JWT_KEY_SECRET as string,
            { expiresIn: "1h" }
        )

        return { token, user }
    }
}

export const authService = new AuthService()
