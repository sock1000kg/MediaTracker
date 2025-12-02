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

export class ApiKeyService {
    private async ensureNotDemo(userId: number) {
        const demoUser = await findUserByUsername("demo")
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

        const existingKey = await findApiKeyForUser(userId, service)
        if (existingKey) {
            throw new AppError("You already have an API key for this service", 409)
        }

        return addApiKeyForUser(userId, encryptKey(key), service)
    }

    async update(userId: number, payload: any) {
        await this.ensureNotDemo(userId)

        const { key, service } = validateSchema(addApiKeySchema, payload)

        const existingKey = await findApiKeyForUser(userId, service)
        if (!existingKey) {
            throw new AppError("API key for this service not found", 404)
        }

        return updateApiKeyForUser(userId, service, encryptKey(key))
    }

    async delete(userId: number, payload: any) {
        await this.ensureNotDemo(userId)

        const { service } = payload
        if (!service) {
            throw new AppError("Missing service in request body", 400)
        }

        const existingKey = await findApiKeyForUser(userId, service)
        if (!existingKey) {
            throw new AppError("API key for this service not found", 404)
        }

        await deleteApiKeyForUser(userId, service)
        return { message: `${service} API Key deleted` }
    }
}

export const apiKeyService = new ApiKeyService()
