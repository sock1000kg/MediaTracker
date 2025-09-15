import { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'

function errorHandler(error: any, req: Request, res: Response, next: NextFunction) {
    //For auth routes, will cchange later
    if (error.message === "Username already taken") 
        return res.status(400).json({ message: "Username already taken" })
    if (error.message === "Cannot find user") 
            return res.status(404).json({ message: "Cannot find user" })

        
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