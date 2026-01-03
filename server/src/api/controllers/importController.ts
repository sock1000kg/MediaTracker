import { goodreadsImportService } from "@/services/imports/goodreadsImportService.js"
import { NextFunction } from "express"
import type { Request, Response } from "express"

export const importGoodReads = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized" })
    }
    

    // Multer puts the file in req.file
    if (!req.file) {
        return res.status(400).json({ message: "No CSV file uploaded" })
    }

    try {
        const result = await goodreadsImportService.importFromGoodReads(userId, req.file.buffer)
        res.status(200).json(result)
    } catch (error) {
        next(error)
    }
}