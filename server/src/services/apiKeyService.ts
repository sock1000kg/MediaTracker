import { addApiKeySchema, deleteApiKeySchema } from "@/schemas/apiKeySchemas.js"
import { encryptKey, validateSchema } from "@/utilities.js"

import {
    addApiKeyForUser,
    deleteApiKeyForUser,
    getAllApiKeys,
    updateApiKeyForUser
} from "@/repositories/apiKeyRepository.js"
import { AppError } from "@/api/domain/error.js"
import { handlePrismaError } from "@/middleWare/errorHandlerMiddleware.js"
import { demoService } from "./demoService.js"

export class ApiKeyService {

    async getAll(userId: number) {
        const apiKeys = await getAllApiKeys(userId)
        if (!apiKeys?.length) {
            throw new AppError("You have no API keys", 404)
        }
        return apiKeys
    }

    async create(userId: number, payload: unknown) {
        await demoService.ensureNotDemo(userId)

        const { key, service } = validateSchema(addApiKeySchema, payload)

        try {
            return await addApiKeyForUser(userId, encryptKey(key), service)
        } catch (error) {
            handlePrismaError(error, { 
                uniqueMessage: "You already have an API key for this service" 
            })
        }
    }

    async update(userId: number, payload: unknown) {
        await demoService.ensureNotDemo(userId)

        const { key, service } = validateSchema(addApiKeySchema, payload)

        try {
            return await updateApiKeyForUser(userId, service, encryptKey(key))
        } catch (error: unknown) {
            handlePrismaError(error, { 
                notFoundMessage: "API key for this service not found" 
            })
        }
    }

    async delete(userId: number, payload: unknown) {
        await demoService.ensureNotDemo(userId)

        const { service } = validateSchema(deleteApiKeySchema, payload)

        try {
            await deleteApiKeyForUser(userId, service)
            return { message: `${service} API Key deleted` }
        } catch (error: unknown) {
            handlePrismaError(error, { 
                notFoundMessage: "API key for this service not found" 
            })
        }
    }
}

export const apiKeyService = new ApiKeyService()
