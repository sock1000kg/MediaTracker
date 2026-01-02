import { handlePrismaError } from "@/middleWare/errorHandlerMiddleware.js"
import prisma from "@/prismaClient.js"
import {
    getAllMediaTypesForUser,
    findMediaTypeForUserOrGlobal,
    findMediaTypeForUser,
    createMediaTypeForUser,
    deleteMediaTypeForUser,
    updateMediaTypeForUser
} from "@/repositories/mediaTypeRepository.js"

import { 
    createMediaTypeSchema, 
    deleteMediaTypeSchema, 
    updateMediaTypeSchema 
} from "@/schemas/mediaTypeSchemas.js"
import { AppError } from "@/api/domain/error.js"

import { validateSchema, normalizeTypeName } from "@/utilities.js"

export class MediaTypeService {
    async getAll(userId: number) {
        return getAllMediaTypesForUser(userId)
    }

    async create(userId: number, payload: unknown) {
        const { name : normalizedName } = validateSchema(createMediaTypeSchema, payload)

        try {
            return await createMediaTypeForUser(normalizedName, userId, prisma)
        } catch (error: unknown) {
            handlePrismaError(error, { uniqueMessage: "Media Type with that name already exists"})
        }
    }

    async delete(userId: number, name: string, payload: unknown) {
        const { confirm } = validateSchema(deleteMediaTypeSchema, payload)
        const normalizedName = normalizeTypeName(name);

        const existing = await findMediaTypeForUser(normalizedName, userId)
        if (!existing) {
            throw new AppError("You can only delete types that you created", 404)
        }

        if (!confirm) {
            return {
                message: `Deleting this Media Type will also delete ${existing.media.length} Media(s) and all Logs tied to them. Confirm deletion?`,
                mediaCount: existing.media.length
            }
        }

        try {
            // You MUST await here for the catch block to work
            await deleteMediaTypeForUser(normalizedName, userId, prisma)
            return { message: "Media Type deleted successfully" }
        } catch (error: unknown) {
            handlePrismaError(error, {
                notFoundMessage: "You can only delete types that you created",
            })
    }
}

    async update(userId: number, oldName: string, payload: unknown) {
        const { newName } = validateSchema(updateMediaTypeSchema, payload)
        const normalizedOldName = normalizeTypeName(oldName)

        const existingOld = await findMediaTypeForUser(normalizedOldName, userId)
        if (!existingOld) {
            throw new AppError("You can only rename types that you created", 404)
        }

        //Check for conflicts with user and global types (global types duplicates cant be checked by db's uniqueness restriction)
        const existingNew = await findMediaTypeForUserOrGlobal(newName, userId, prisma)
        if (existingNew) {
            throw new AppError("Media Type with that name already exists", 409)
        }

        try {
            return await updateMediaTypeForUser(normalizedOldName, newName, userId)
        } catch (error: unknown) {
             handlePrismaError(
                error, 
                { 
                    uniqueMessage: "Media Type with that name already exists",
                    notFoundMessage: "Media Type with that name does not exist"
                })
        }
    }
}

export const mediaTypeService = new MediaTypeService();