import { NextFunction, Request, Response } from "express"
import { mediaService } from "@/services/mediaService.js"

// Get all medias
export const getMedias = async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.userId
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized: missing userId" })
  }

  try {
      const medias = await mediaService.getAll(userId)
      res.status(200).json(medias)
  } catch (error) {
      next(error)
  }
}

// Create media
export const createNewMedia = async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.userId
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized: missing userId" })
  }
    
  try {
      const media = await mediaService.create(userId, req.body)
      res.status(201).json(media)
  } catch (error) {
    next(error)
  }
}

// UPDATE media, mediaId is sent in params
export const updateExistingMedia = async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.userId
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized: missing userId" })
  }
  
  const mediaId = Number(req.params.id)
  if (Number.isNaN(mediaId)) {
    return res.status(400).json({ message: "Invalid mediaId params" })
  }

  try {
    const updated = await mediaService.update(userId, mediaId, req.body)
    res.status(200).json(updated)
  } catch (error) {
    next(error)
  }
}

// Delete media, mediaId is sent in params
export const deleteExistingMedia = async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.userId
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized: missing userId" })
  }

  const mediaId = parseInt(req.params.id)
  if (!mediaId) {
    return res.status(400).json({ message: "Invalid mediaId params" })
  }

  try {
    const result = await mediaService.delete(userId, mediaId, req.body)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}

export const createMediaAndLog = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" })
    }

    try {
        const result = await mediaService.createMediaAndLog(userId, req.body)
        res.status(201).json(result)
    } catch (error) {
        next(error)
    }
}

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
        const result = await mediaService.importFromGoodReads(userId, req.file.buffer)
        res.status(200).json(result)
    } catch (error) {
        next(error)
    }
}