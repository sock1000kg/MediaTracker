import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { createUser, findUserByUsername } from "@/repositories/authRepository.js"
import { findFirstMediaByTitle } from "@/repositories/mediaRepository.js"
import { createLog } from "@/repositories/logsRepository.js"
import { registerSchema, loginSchema } from "@/schemas/authSchemas.js"
import { validateSchema } from "@/utilities.js"
import { AppError } from "@/types/error.js"
import prisma from "@/prismaClient.js"
import { handlePrismaError } from "@/middleWare/errorHandlerMiddleware.js"

export class AuthService {
    async register(payload: any) {
        const { username, password, displayName } = validateSchema(registerSchema, payload)

        return await prisma.$transaction(async (tx) => {
            const existingUser = await findUserByUsername(username, tx)
            if (existingUser) {
                throw new AppError("Username already taken", 400)
            }
            
            const hashedPassword = bcrypt.hashSync(password, 12)

            try {
                const user = await createUser(username, displayName, hashedPassword, tx)

                // Create a default log for new users
                const defaultMedia = await findFirstMediaByTitle("Default Media", tx)
                if (!defaultMedia) {
                    throw new AppError("Default Media not found", 404)
                }

                await createLog(
                    user.id,
                    defaultMedia.id,
                    "completed",
                    100,
                    "Welcome! This is your default log! Search up or create a custom media to log it!",
                    tx
                )

                // Generate JWT
                const token = jwt.sign(
                    { id: user.id },
                    process.env.JWT_KEY_SECRET as string,
                    { expiresIn: "1h" }
                )

                return { token, user }
            } catch (error: any) {
                // handlePrismaError will re-throw the error, triggering a rollback
                handlePrismaError(error, {
                    uniqueMessage: "Username already taken",
                })
            }
        })
    }

    async login(payload: any) {
        const { username, password } = validateSchema(loginSchema, payload)

        const user = await findUserByUsername(username, prisma)
        if (!user) {
            throw new AppError("Cannot find user", 404)
        }

        const passwordIsValid = bcrypt.compareSync(password, user.password)
        if (!passwordIsValid) {
            throw new AppError("Invalid password", 401)
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
