import type { NextFunction, Request, Response } from "express"
import { authService } from "@/services/authService.js"

export const registerUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await authService.register(req.body)
        res.status(201).json(result)
    } catch (error: any) {
        next(error)
    }
}

export const loginUser = async (req: Request, res: Response, next: NextFunction) => {
    
    try {
        const result = await authService.login(req.body)
        res.status(200).json(result)
    } catch (error: any) {
        next(error)
    }
}

export const refreshToken = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { token } = req.body
        const result = await authService.refresh(token)
        res.status(200).json(result)
    } catch (error: any) {
        next(error)
    }
} 