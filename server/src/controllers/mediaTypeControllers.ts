import { Request, Response } from 'express'
import { 
  getAllMediaTypesForUser, 
  findMediaTypeForUserOrGlobal, 
  findMediaTypeForUser,
  createMediaTypeForUser, 
  deleteMediaTypeForUser, 
  updateMediaTypeForUser 
} from '@/controllers/dbCalls/dbControllers'
import { normalizeTypeName, validateSchema } from '../utilities'

import { z } from 'zod'
import { createMediaTypeSchema, deleteMediaTypeSchema, updateMediaTypeSchema } from '@/schemas/mediaTypeSchemas'

export async function getAllMediaTypes(req: Request, res: Response) {
    const userId = req.userId
    if (!userId) return res.status(401).json({ message: "Unauthorized: missing userId" })

    try {
        const types = await getAllMediaTypesForUser(userId)
        res.status(200).json(types)
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Failed to fetch user media types' })
    }
}

export async function createMediaType(req: Request, res: Response) {
    const userId = req.userId
    if (!userId) return res.status(401).json({ message: "Unauthorized: missing userId" })

    //Sanitization
    const { name: normalizedName } = validateSchema(createMediaTypeSchema, req.body)

    try {
        const existingMediaType = await findMediaTypeForUserOrGlobal(normalizedName, userId)
        if (existingMediaType) return res.status(409).json({ message: "Media Type already exists" })

        const mediaType = await createMediaTypeForUser(normalizedName, userId)
        res.status(201).json(mediaType)
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: "Failed to create Media Type" })
    }
}

export async function deleteMediaType(req: Request, res: Response) {
    const name = decodeURIComponent(req.params.name)
    
    const userId = req.userId
    if (!userId) return res.status(401).json({ message: "Unauthorized: missing userId" })

    //Sanitization
    const { confirm } = validateSchema(deleteMediaTypeSchema, req.body)

    const normalizedName = normalizeTypeName(name)

    try {
        const existingMediaType = await findMediaTypeForUser(normalizedName, userId)
        if (!existingMediaType) return res.status(404).json({ message: "You can only delete types that you created" })

        if (!confirm) return res.status(200).json({ 
            message: `Deleting this Media Type will also delete ${existingMediaType.media.length} Media(s) and all Logs tied to them. Confirm deletion?`,
            mediaCount: existingMediaType.media.length
        })

        await deleteMediaTypeForUser(normalizedName, userId)
        res.status(200).json({ message: "Media Type deleted successfully" })
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: "Failed to delete Media Type" })
    }
}

export async function updateMediaType(req: Request, res: Response) {
    const name = decodeURIComponent(req.params.name)

    const userId = req.userId
    if (!userId) return res.status(401).json({ message: "Unauthorized: missing userId" })

    //Sanitization
    const { newName: normalizedNewName } = validateSchema(updateMediaTypeSchema, req.body)

    const normalizedOldName = normalizeTypeName(name)


    try {
        const existingOldMediaType = await findMediaTypeForUser(normalizedOldName, userId)
        if (!existingOldMediaType) return res.status(404).json({ message: "You can only rename types that you created" })

        const existingNewMediaType = await findMediaTypeForUserOrGlobal(normalizedNewName, userId)
        if (existingNewMediaType) return res.status(409).json({ message: "Media Type with that name already exists" })

        const updated = await updateMediaTypeForUser(normalizedOldName, normalizedNewName, userId)
        res.status(200).json(updated)
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: "Failed to update Media Type" })
    }
}
