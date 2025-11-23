import {
    getAllMediaTypesForUser,
    findMediaTypeForUserOrGlobal,
    findMediaTypeForUser,
    createMediaTypeForUser,
    deleteMediaTypeForUser,
    updateMediaTypeForUser
} from "@/repositories/mediaTypeCalls.js"

import { 
    createMediaTypeSchema, 
    deleteMediaTypeSchema, 
    updateMediaTypeSchema 
} from "@/schemas/mediaTypeSchemas.js"

import { validateSchema, normalizeTypeName } from "@/utilities.js"

export class MediaTypeService {
    async getAll(userId: number) {
        return getAllMediaTypesForUser(userId)
    }

    async create(userId: number, payload: any) {
        const { name : normalizedName } = validateSchema(createMediaTypeSchema, payload)

        const existing = await findMediaTypeForUserOrGlobal(normalizedName, userId)
        if (existing) {
            throw Object.assign(new Error("Media Type already exists"), { status: 409 })
        }

        return createMediaTypeForUser(normalizedName, userId)
    }

    async delete(userId: number, name: string, payload: any) {
        const { confirm } = validateSchema(deleteMediaTypeSchema, payload)
        const normalizedName = normalizeTypeName(name);

        const existing = await findMediaTypeForUser(normalizedName, userId)
        if (!existing) {
            throw Object.assign(new Error("You can only delete types that you created"), { status: 404 });
        }

        if (!confirm) {
            return {
                confirmNeeded: true,
                message: `Deleting this Media Type will also delete ${existing.media.length} Media(s) and all Logs tied to them.`,
                mediaCount: existing.media.length
            }
        }

        await deleteMediaTypeForUser(normalizedName, userId)
        return { message: "Media Type deleted successfully" }
    }

    async update(userId: number, oldName: string, payload: any) {
        const { newName } = validateSchema(updateMediaTypeSchema, payload)
        const normalizedOldName = normalizeTypeName(oldName)

        const existingOld = await findMediaTypeForUser(normalizedOldName, userId)
        if (!existingOld) {
            throw Object.assign(new Error("You can only rename types that you created"), { status: 404 })
        }

        const existingNew = await findMediaTypeForUserOrGlobal(newName, userId);
        if (existingNew) {
            throw Object.assign(new Error("Media Type with that name already exists"), { status: 409 })
        }

        return updateMediaTypeForUser(normalizedOldName, newName, userId);
    }
}

export const mediaTypeService = new MediaTypeService();