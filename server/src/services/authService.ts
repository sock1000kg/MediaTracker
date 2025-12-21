import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { createUser, deleteRefreshToken, findRefreshToken, findUserByUsername, saveRefreshToken } from "@/repositories/authRepository.js"
import { findFirstMediaByTitle } from "@/repositories/mediaRepository.js"
import { createLog } from "@/repositories/logsRepository.js"
import { registerSchema, loginSchema } from "@/schemas/authSchemas.js"
import { validateSchema } from "@/utilities.js"
import { AppError } from "@/types/error.js"
import prisma from "@/prismaClient.js"
import { handlePrismaError } from "@/middleWare/errorHandlerMiddleware.js"

export class AuthService {
    private generateTokens(userId: number) {
        const accessToken = jwt.sign({ id: userId }, process.env.JWT_KEY_SECRET!, { expiresIn: "15m" })
        const refreshToken = jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET!, { expiresIn: "7d" })
        return { accessToken, refreshToken }
    }

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

                const { accessToken, refreshToken } = this.generateTokens(user.id)

                const expiresAt = new Date()
                expiresAt.setDate(expiresAt.getDate() + 7)
                await saveRefreshToken(user.id, refreshToken, expiresAt, tx)

                return { accessToken, refreshToken, user }
            } catch (error: any) {
                console.log("DEBUG: Registration failed with error code:", error.code, "Target:", error.meta?.target)
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

        const { accessToken, refreshToken } = this.generateTokens(user.id)

        const expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + 7)
        try {
            await saveRefreshToken(user.id, refreshToken, expiresAt, prisma)
            return { accessToken, refreshToken, user }
        } catch (error) {
            handlePrismaError(error, {
                uniqueMessage: "Refresh Token already exists"
            })
        }

    }

    async refresh(oldRefreshToken: string) {
        const storedToken = await findRefreshToken(oldRefreshToken)
        
        if (!storedToken || storedToken.expiresAt < new Date()) {
            if (storedToken) await deleteRefreshToken(oldRefreshToken)
            throw new AppError("Refresh token expired or revoked", 401)
        }

        // Verify JWT signature
        try {
            const decoded: any = jwt.verify(oldRefreshToken, process.env.JWT_REFRESH_SECRET as string)
            
            // Token Rotation: Delete old token and generate new ones
            await deleteRefreshToken(oldRefreshToken) 
            const tokens = this.generateTokens(decoded.id)

            const expiresAt = new Date()
            expiresAt.setDate(expiresAt.getDate() + 7)
            await saveRefreshToken(decoded.id, tokens.refreshToken, expiresAt, prisma)

            return tokens
        } catch (error) {
            await deleteRefreshToken(oldRefreshToken) // delete suspicious token
            throw new AppError("Invalid refresh token", 401)
        }
    }
    
    async logout(token: string) {
        if (token) {
            await deleteRefreshToken(token);
        }
    }
}


export const authService = new AuthService()
