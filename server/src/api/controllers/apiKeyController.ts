import { addApiKeySchema } from "@/schemas/apiKeySchemas.js"
import { encryptKey, validateSchema } from "@/utilities.js"
import { NextFunction, Request, Response } from "express"

import { addApiKeyForUser, deleteApiKeyForUser, findApiKeyForUser, getAllApiKeys, updateApiKeyForUser } from "@/repositories/apiKeyRepository.js"
import { findUserByUsername } from "../../repositories/authRepository.js"

//Get all api keys (encrypted) based on userId
export const getApiKeys = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (userId == null) 
        return res.status(401).json({ message: "Unauthorized: missing userId" })

    try {
        const apiKeys = await getAllApiKeys(userId)
        if(!apiKeys?.length)
            return res.status(404).json({ message: "You have no API keys" })

        return res.status(200).json(apiKeys)
    }catch(error){
        next(error)
    }
}

//Create api key, key and service sent in body
export const addApiKey = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (userId == null) 
        return res.status(401).json({ message: "Unauthorized: missing userId" })

    const demoUser = await findUserByUsername("demo")
    if(!demoUser) {
        return res.status(404).json({ message: "Demo user missing" })
    }
    if(userId === demoUser.id)
        return res.status(400).json({ message: "This feature is not available on demo account" })
    
    try{
        console.log("BODY RECEIVED:", req.body)
        const { key, service } = validateSchema(addApiKeySchema, req.body)

        const existingKey = await findApiKeyForUser(userId, service)
        if(existingKey)
            return res.status(409).json({ message: "You already have an API key for this service"})

        const apiKey = await addApiKeyForUser(userId, encryptKey(key), service)
        res.status(201).json(apiKey)
    }catch(error){
        next(error)
    }
}

//Update api key, key and service sent in body
export const updateApiKey = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (userId == null)
        return res.status(401).json({ message: "Unauthorized: missing userId" })

    const demoUser = await findUserByUsername("demo")
    if(!demoUser) {
        return res.status(404).json({ message: "Demo user missing" })
    }
    if(userId === demoUser.id)
        return res.status(400).json({ message: "This feature is not available on demo account" })
    

    try {
        const { key, service } = validateSchema(addApiKeySchema, req.body)

        const existingKey = await findApiKeyForUser(userId, service)
        if (!existingKey)
            return res.status(404).json({ message: "API key for this service not found" })

        // Update the key
        const updatedKey = await updateApiKeyForUser(userId, service, encryptKey(key))
        res.status(200).json(updatedKey)
    } catch (error) {
        next(error)
    }
}

//delete api key, service sent in body
export const deleteApiKey = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (userId == null)
        return res.status(401).json({ message: "Unauthorized: missing userId" })

    if(userId === 2)
        return res.status(400).json({ message: "This feature is not available on demo account" })
    

    const { service } = req.body
    if (!service)
        return res.status(400).json({ message: "Missing service in request body" })

    try {
        const existingKey = await findApiKeyForUser(userId, service)
        if (!existingKey)
            return res.status(404).json({ message: "API key for this service not found" })

        await deleteApiKeyForUser(userId, service)
        res.status(200).json({ message: `${service} API Key deleted`})
    } catch (error) {
        next(error)
    }
}