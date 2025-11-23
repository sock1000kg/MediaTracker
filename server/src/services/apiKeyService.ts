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

export class ApiKeyService {
    private async ensureNotDemo(userId: number) {
        const demoUser = await findUserByUsername("demo")
        if (!demoUser) {
            throw Object.assign(new Error("Demo user missing"), { status: 404 })
        }
        if (userId === demoUser.id) {
            throw Object.assign(new Error("This feature is not available on demo account"), { status: 400 })
        }
    }

    async getAll(userId: number) {
        const apiKeys = await getAllApiKeys(userId)
        if (!apiKeys?.length) {
            throw Object.assign(new Error("You have no API keys"), { status: 404 })
        }
        return apiKeys
    }

    async create(userId: number, payload: any) {
        await this.ensureNotDemo(userId)

        const { key, service } = validateSchema(addApiKeySchema, payload)

        const existingKey = await findApiKeyForUser(userId, service)
        if (existingKey) {
            throw Object.assign(new Error("You already have an API key for this service"), { status: 409 })
        }

        return addApiKeyForUser(userId, encryptKey(key), service)
    }

    async update(userId: number, payload: any) {
        await this.ensureNotDemo(userId)

        const { key, service } = validateSchema(addApiKeySchema, payload)

        const existingKey = await findApiKeyForUser(userId, service)
        if (!existingKey) {
            throw Object.assign(new Error("API key for this service not found"), { status: 404 })
        }

        return updateApiKeyForUser(userId, service, encryptKey(key))
    }

    async delete(userId: number, payload: any) {
        await this.ensureNotDemo(userId)

        const { service } = payload
        if (!service) {
            throw Object.assign(new Error("Missing service in request body"), { status: 400 })
        }

        const existingKey = await findApiKeyForUser(userId, service)
        if (!existingKey) {
            throw Object.assign(new Error("API key for this service not found"), { status: 404 })
        }

        await deleteApiKeyForUser(userId, service)
        return { message: `${service} API Key deleted` }
    }
}

export const apiKeyService = new ApiKeyService()
