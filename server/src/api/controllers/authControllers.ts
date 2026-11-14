import type { NextFunction, Request, Response } from "express"
import { AppError } from "@/api/domain/error.js"
import { authService } from "@/services/authService.js"

export const COOKIES_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    domain: process.env.NODE_ENV === 'production' ? 'sock1000kg.io.vn' : undefined,
    maxAge: 7 * 24 * 60 * 60 * 1000
}

export const registerUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { accessToken, refreshToken, user } = await authService.register(req.body)
        res.cookie('refreshToken', refreshToken, COOKIES_OPTIONS)
        res.status(201).json({ accessToken, user })
    } catch (error) {
        next(error)
    }
}

export const loginUser = async (req: Request, res: Response, next: NextFunction) => {
    
    try {
        const { accessToken, refreshToken, user } = await authService.login(req.body)
        res.cookie('refreshToken', refreshToken, COOKIES_OPTIONS)
        res.status(200).json({ accessToken, user })
    } catch (error) {
        next(error)
    }
}

export const refreshToken = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const oldToken = req.cookies.refreshToken;
        // No cookie: nothing to clear, and it is the caller's problem (401), not a server error
        if (!oldToken) throw new AppError("No refresh token", 401, { clearSession: false })

        const { accessToken, refreshToken } = await authService.refresh(oldToken);
        res.cookie('refreshToken', refreshToken, COOKIES_OPTIONS)
        res.status(200).json({ accessToken })
    } catch (error) {
        // A losing concurrent refresh must not wipe the cookie the winning request just set
        if (!(error instanceof AppError && !error.clearSession)) res.clearCookie('refreshToken')
        next(error)
    }
} 

export const logoutUser = async (req: Request, res: Response) => {
    const token = req.cookies.refreshToken
    await authService.logout(token)
    res.clearCookie('refreshToken')
    res.status(204).send()
}