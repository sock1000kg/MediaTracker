import { NextFunction, Request, Response } from "express"
import { userService } from "@/services/userService.js"
import { COOKIES_OPTIONS } from "@/api/controllers/authControllers.js"
import { AppError } from "@/api/domain/error.js"

const uid = (req: Request) => {
    if (req.userId == null) throw new AppError("Unauthorized: missing userId", 401)
    return req.userId
}

export const getMe = async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(200).json(await userService.getMe(uid(req))) } catch (e) { next(e) }
}

export const updateMe = async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(200).json(await userService.updateProfile(uid(req), req.body)) } catch (e) { next(e) }
}

export const changePassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { accessToken, refreshToken } = await userService.changePassword(uid(req), req.body)
        res.cookie('refreshToken', refreshToken, COOKIES_OPTIONS)
        res.status(200).json({ accessToken })
    } catch (e) { next(e) }
}

export const getPreferences = async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(200).json(await userService.getPreferences(uid(req))) } catch (e) { next(e) }
}

export const updatePreferences = async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(200).json(await userService.updatePreferences(uid(req), req.body)) } catch (e) { next(e) }
}

export const exportMe = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const format = req.query.format ?? "json"
        if (format !== "json" && format !== "csv") throw new AppError("format must be json or csv", 400)
        const { body, contentType, disposition } = await userService.exportData(uid(req), format)
        res.setHeader("Content-Type", contentType)
        res.setHeader("Content-Disposition", disposition)
        res.status(200).send(body)
    } catch (e) { next(e) }
}

export const deleteMe = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await userService.deleteAccount(uid(req), req.body)
        const { maxAge: _maxAge, ...clearOpts } = COOKIES_OPTIONS
        res.clearCookie('refreshToken', clearOpts)
        res.status(204).send()
    } catch (e) { next(e) }
}
