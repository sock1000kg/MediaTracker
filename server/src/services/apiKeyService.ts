import { addApiKeySchema } from "@/schemas/apiKeySchemas.js"
import { encryptKey, validateSchema } from "@/utilities.js"

import {
    addApiKeyForUser,
    deleteApiKeyForUser,
    findApiKeyForUser,
    getAllApiKeys,
    updateApiKeyForUser
} from "@/repositories/apiKeyRepository.js"

import { findUserByUsername } from "@/repositories/authRepository.js"
import { AppError } from "@/types/error.js"
import prisma from "@/prismaClient.js"
import { handlePrismaError } from "@/middleWare/errorHandlerMiddleware.js"

export class ApiKeyService {
    private async ensureNotDemo(userId: number) {
        const demoUser = await findUserByUsername("demo", prisma)
        if (!demoUser) {
            throw new AppError("Demo user missing", 404)
        }
        if (userId === demoUser.id) {
            throw new AppError("This feature is not available on demo account", 400)
        }
    }

    async getAll(userId: number) {
        const apiKeys = await getAllApiKeys(userId)
        if (!apiKeys?.length) {
            throw new AppError("You have no API keys", 404)
        }
        return apiKeys
    }

    async create(userId: number, payload: any) {
        await this.ensureNotDemo(userId)

        const { key, service } = validateSchema(addApiKeySchema, payload)

        try {
            return await addApiKeyForUser(userId, encryptKey(key), service)
        } catch (error: any) {
            handlePrismaError(error, { 
                uniqueMessage: "You already have an API key for this service" 
            })
        }
    }

    async update(userId: number, payload: any) {
        await this.ensureNotDemo(userId)

        const { key, service } = validateSchema(addApiKeySchema, payload)

        try {
            return await updateApiKeyForUser(userId, service, encryptKey(key))
        } catch (error: any) {
            handlePrismaError(error, { 
                notFoundMessage: "API key for this service not found" 
            })
        }
    }

    async delete(userId: number, payload: any) {
        await this.ensureNotDemo(userId)

        const { service } = payload
        if (!service) {
            throw new AppError("Missing service in request body", 400)
        }

        try {
            await deleteApiKeyForUser(userId, service)
            return { message: `${service} API Key deleted` }
        } catch (error: any) {
            handlePrismaError(error, { 
                notFoundMessage: "API key for this service not found" 
            })
        }
    }
}

export const apiKeyService = new ApiKeyService()
