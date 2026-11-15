import { AppError } from '@/api/domain/error.js'
import { Prisma } from '@/db.js'
import { NextFunction, Request, Response } from 'express'
import multer from 'multer'
import { ZodError } from 'zod'

function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: 'File is too large (max 10 MB)' })
        }
        return res.status(400).json({ message: error.message })
    }

    // Recognize service errors with `status`
    if (error instanceof AppError) {
        const payload: Record<string, unknown> = { message: error.message }
        const tag = (error as unknown as { tag?: { id: number; name: string } }).tag
        if (tag) {
            payload.id = tag.id
            payload.name = tag.name
            payload.tag = tag
        }
        const collection = (error as unknown as { collection?: { id: number; name: string } }).collection
        if (collection) {
            payload.id = collection.id
            payload.name = collection.name
            payload.collection = collection
        }
        return res.status(error.status).json(payload)
    }

    if (error instanceof ZodError) {
        // return first validation error as JSON
        return res.status(400).json({
            message: error.issues[0]?.message || "Validation failed",
            errors: error.issues
        })
    }

    console.error("INTERNAL ERROR:", error)
    res.status(500).json({ message: "Internal server error" })
}

export function handlePrismaError(error: unknown, options?: { uniqueMessage?: string, notFoundMessage?: string }): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        switch(error.code) {
            // Not found error in where clause
            case "P2001": throw new AppError(options?.notFoundMessage || "Resource not found", 404)
            // Unique constraint violation
            case "P2002": throw new AppError(options?.uniqueMessage || "Resource already exists", 409)
            //Foreign key violation
            case "P2003": throw new AppError((options?.notFoundMessage || "Resource") + " | Foreign key violation", 400)
            // Not found error for resource needed in transaction
            case "P2025": throw new AppError(options?.notFoundMessage || "Resource not found in transaction", 404)
            default: throw error
        }
    }

    throw error
}

export default errorHandler