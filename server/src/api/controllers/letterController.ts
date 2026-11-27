import { NextFunction, Request, Response } from "express"
import { letterService } from "@/services/letterService.js"
import { AppError } from "@/api/domain/error.js"
import { idParamSchema } from "@/schemas/common.js"
import { validateSchema } from "@/utilities.js"

const uid = (req: Request) => {
    if (req.userId == null) throw new AppError("Unauthorized: missing userId", 401)
    return req.userId
}
const letterId = (req: Request) => validateSchema(idParamSchema, req.params).id

export const getLetters = async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(200).json(await letterService.getAll(uid(req))) } catch (e) { next(e) }
}

export const getLetterSummary = async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(200).json(await letterService.summary(uid(req))) } catch (e) { next(e) }
}

export const createLetter = async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await letterService.create(uid(req), req.body)) } catch (e) { next(e) }
}

export const openLetter = async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(200).json(await letterService.open(uid(req), letterId(req))) } catch (e) { next(e) }
}

export const deleteLetter = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await letterService.delete(uid(req), letterId(req))
        res.status(204).send()
    } catch (e) { next(e) }
}
