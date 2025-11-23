import { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'

function errorHandler(error: any, req: Request, res: Response, next: NextFunction) {
    // Recognize service errors with `status`
    if (error.status) {
        return res.status(error.status).json({ message: error.message })
    }

    if (error instanceof ZodError) {
        // return first validation error as JSON
        return res.status(400).json({
            message: error.issues[0]?.message || "Validation failed",
            errors: error.issues
        })
    }

    console.dir(error, { depth: null })
    
    console.error(error)
    res.status(500).json({ message: "Internal server error" })
}

export default errorHandler