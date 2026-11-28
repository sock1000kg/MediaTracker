import { NextFunction, Request, Response } from "express"
import { mediaService } from "@/services/mediaService.js"
import { mediaRefreshService } from "@/services/mediaRefreshService.js"
import { idParamSchema } from "@/schemas/common.js"
import { validateSchema } from "@/utilities.js"

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

  try {
    const { id } = validateSchema(idParamSchema, req.params)
    const updated = await mediaService.update(userId, id, req.body)
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

  try {
    const { id } = validateSchema(idParamSchema, req.params)
    const result = await mediaService.delete(userId, id, req.body)
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

export const getMediaChildren = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    try {
        const { id } = validateSchema(idParamSchema, req.params)
        const children = await mediaService.getChildren(id, userId)
        res.status(200).json(children)
    } catch (error) {
        next(error)
    }
}

export const refreshMedia = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized" })
    }

    try {
        const { id } = validateSchema(idParamSchema, req.params)
        const result = await mediaRefreshService.refreshMedia(userId, id)
        res.status(200).json(result)
    } catch (error) {
        next(error)
    }
}
