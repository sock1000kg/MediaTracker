import { Request, Response } from "express"
import { z } from "zod"
import { 
  getAllMediasForUser,
  findMediaById,
  findMediaForUser,
  findMediaTypeForUserOrGlobal,
  createMedia,
  updateMediaForUser,
  deleteMedia,
} from "@/controllers/dbCalls/dbControllers"

import { createMediaSchema, updateMediaSchema, deleteMediaSchema } from "@/schemas/mediaSchemas"
import { validateSchema } from "@/utilities"

// GET all medias
export const getMedias = async (req: Request, res: Response) => {
  const userId = req.userId
  if (!userId) return res.status(401).json({ message: "Unauthorized: missing userId" })

  try {
      const medias = await getAllMediasForUser(userId)
      res.status(200).json(medias)
  } catch (error) {
      console.error(error)
      res.status(500).json({ message: "Failed to fetch media" })
  }
}

// CREATE media
export const createNewMedia = async (req: Request, res: Response) => {
  const userId = req.userId
  if (!userId) return res.status(401).json({ message: "Unauthorized: missing userId" })

  //Sanitization
  const { title, mediaType, creator, year, metadata } = validateSchema(createMediaSchema, req.body)

  try {
      const existingType = await findMediaTypeForUserOrGlobal(mediaType.name, userId)
      if (!existingType) return res.status(404).json({ message: "Media Type does not exist" })

      const existingMedia = await findMediaForUser(title, userId, existingType, creator, year, metadata)
      if (existingMedia) return res.status(409).json({ message: "Media already exists", existingMedia })

      const media = await createMedia(title, existingType, creator, year, metadata, userId)
      res.status(201).json(media)
  } catch (error) {
      console.error(error)
      res.status(500).json({ message: "Failed to create media" })
  }
}

// UPDATE media
export const updateExistingMedia = async (req: Request, res: Response) => {
  const userId = req.userId
  if (!userId) return res.status(401).json({ message: "Unauthorized: missing userId" })
  
  const mediaId = parseInt(req.params.id)
  if (!mediaId) return res.status(400).json({ message: "Invalid params" })

  //Sanitization
  const { title, mediaType, creator, year, metadata } = validateSchema(updateMediaSchema, req.body)

  try {
    const existing = await findMediaById(mediaId)
    if (!existing) return res.status(404).json({ message: "Media not found" })
    if (existing.userId !== userId) return res.status(403).json({ message: "You can only edit medias that you created" })

    const existingType = await findMediaTypeForUserOrGlobal(mediaType.name, userId)
    if (!existingType) return res.status(404).json({ message: "Media Type does not exist" })

    const duplicate = await findMediaForUser(title, userId, existingType, creator, year, metadata)
    if (duplicate) return res.status(409).json({ message: "Media already exists, please enter new information", duplicate })

    const updated = await updateMediaForUser(title, existingType, creator, year, metadata, userId, mediaId)
    res.status(200).json(updated)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Failed to update media" })
  }
}

// DELETE media
export const deleteExistingMedia = async (req: Request, res: Response) => {
  const userId = req.userId
  if (!userId) return res.status(401).json({ message: "Unauthorized: missing userId" })

  const mediaId = parseInt(req.params.id)
  if (!mediaId) return res.status(400).json({ message: "Invalid params" })

  //Sanitization
  const { confirm } = validateSchema(deleteMediaSchema, req.body)

  try {
    const media = await findMediaById(mediaId)
    if (!media) return res.status(404).json({ message: "Media not found" })
    if (media.userId !== userId) return res.status(403).json({ message: "You can only delete medias that you created" })

    if (!confirm) return res.status(200).json({ 
      message: `Deleting ${media.title} will also delete your Log of it. Confirm deletion?`, 
      logsCount: media.logs.length 
    })

    await deleteMedia(mediaId)
    res.status(200).json({ message: "Media deleted" })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Failed to delete media" })
  }
}
