import { AppError } from '@/api/domain/error.js'
import { Prisma } from '@prisma/client'
import { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'

function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
    // Recognize service errors with `status`
    if (error instanceof AppError) {
        return res.status(error.status).json({ message: error.message })
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