import type { NextFunction, Request, Response } from "express"
import { authService } from "@/services/authService.js"

const COOKIES_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'none' as const,
    path: '/',
    domain: 'sock1000kg.io.vn',
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
        if (!oldToken) throw new Error("No refresh token")

        const { accessToken, refreshToken } = await authService.refresh(oldToken);
        res.cookie('refreshToken', refreshToken, COOKIES_OPTIONS)
        res.status(200).json({ accessToken })
    } catch (error) {
        res.clearCookie('refreshToken')
        next(error)
    }
} 

export const logoutUser = async (req: Request, res: Response) => {
    const token = req.cookies.refreshToken
    await authService.logout(token)
    res.clearCookie('refreshToken')
    res.status(204).send()
}