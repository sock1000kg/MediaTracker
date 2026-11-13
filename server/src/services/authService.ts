import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { randomUUID } from "node:crypto"
import { createUser, deleteRefreshToken, findRefreshToken, findUserByUsername, saveRefreshToken } from "@/repositories/authRepository.js"
import { findFirstMediaByTitle } from "@/repositories/mediaRepository.js"
import { createLog } from "@/repositories/logsRepository.js"
import { registerSchema, loginSchema } from "@/schemas/authSchemas.js"
import { validateSchema } from "@/utilities.js"
import { AppError } from "@/api/domain/error.js"
import prisma from "@/prismaClient.js"
import { handlePrismaError } from "@/middleWare/errorHandlerMiddleware.js"

export class AuthService {
    generateTokens(userId: number) {
        const accessToken = jwt.sign({ id: userId }, process.env.JWT_KEY_SECRET!, { expiresIn: "15m" })
        const refreshToken = jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET!, { expiresIn: "7d", jwtid: randomUUID() })
        return { accessToken, refreshToken }
    }

    // Issue a fresh token pair and persist the refresh token (7 day expiry)
    async issueSession(userId: number, client: Parameters<typeof saveRefreshToken>[3]) {
        const { accessToken, refreshToken } = this.generateTokens(userId)
        const expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + 7)
        await saveRefreshToken(userId, refreshToken, expiresAt, client)
        return { accessToken, refreshToken }
    }

    async register(payload: unknown) {
        // Only people with this key is allow to register
        const { registerKey } = payload as { registerKey?: string}
        if (!process.env.REGISTER_KEY) {
            throw new AppError("Registration key env is missing", 403)
        }
        if (process.env.REGISTER_KEY !== registerKey) {
            throw new AppError("Invalid Registration Key", 403)
        }

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
            } catch (error: unknown) {
                handlePrismaError(error, {
                    uniqueMessage: "Username already taken",
                })
            }
        })
    }

    async login(payload: unknown) {
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

        // Not found usually means a concurrent request already rotated it: do not treat as suspicious
        if (!storedToken) {
            throw new AppError("Refresh token expired or revoked", 401, { clearSession: false })
        }
        if (storedToken.expiresAt < new Date()) {
            await deleteRefreshToken(oldRefreshToken)
            throw new AppError("Refresh token expired or revoked", 401)
        }

        // Verify JWT signature
        let userId: number
        try {
            const decoded = jwt.verify(oldRefreshToken, process.env.JWT_REFRESH_SECRET as string)
            if (typeof decoded === "string" || !decoded.id) throw new Error("Invalid token payload")
            userId = decoded.id
        } catch {
            await deleteRefreshToken(oldRefreshToken) // delete suspicious token
            throw new AppError("Invalid refresh token", 401)
        }

        // Token rotation: only the request that actually deletes the row wins
        const deleted = await deleteRefreshToken(oldRefreshToken)
        if (deleted === 0) {
            throw new AppError("Refresh token expired or revoked", 401, { clearSession: false })
        }
        const tokens = this.generateTokens(userId)
        const expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + 7)
        await saveRefreshToken(userId, tokens.refreshToken, expiresAt, prisma)
        return tokens
    }
    
    async logout(token: string) {
        if (token) {
            await deleteRefreshToken(token);
        }
    }
}


export const authService = new AuthService()
