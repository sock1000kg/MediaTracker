import { addApiKeySchema } from "@/schemas/apiKeySchemas"
import { validateSchema } from "@/utilities"
import { Request, Response } from "express"
import { ZodError } from "zod"
import { addApiKeyForUser, deleteApiKeyForUser, findApiKeyForUser, getAllApiKeys, updateApiKeyForUser } from "./dbCalls/apiKey"

//Get all api keys based on userId
export const getApiKeys = async (req: Request, res: Response) => {
    const userId = req.userId
    if (userId == null) 
        return res.status(401).json({ message: "Unauthorized: missing userId" })

    try {
        const apiKeys = await getAllApiKeys(userId)
        if(!apiKeys?.length)
            return res.status(404).json({ message: "You have no API keys" })

        return res.status(200).json(apiKeys)
    }catch(error){
        console.error(error)
        res.status(500).json({ message: "Failed to add api key" })
    }
}

//Create api key, key and service sent in body
export const addApiKey = async (req: Request, res: Response) => {
    const userId = req.userId
    if (userId == null) 
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    
    try{
        console.log("BODY RECEIVED:", req.body)
        const { key, service } = validateSchema(addApiKeySchema, req.body)

        const existingKey = await findApiKeyForUser(userId, service)
        if(existingKey)
            return res.status(409).json({ message: "You already have an API key for this service"})

        const apiKey = await addApiKeyForUser(userId, key, service)
        res.status(201).json(apiKey)
    }catch(error){
        if (error instanceof ZodError) {
        // return first validation error as JSON
            return res.status(400).json({
                message: error.issues[0]?.message || "Validation failed",
                errors: error.issues
            })
        }

        console.error(error)
        res.status(500).json({ message: "Failed to add api key" })
    }
}

//Update api key, key and service sent in body
export const updateApiKey = async (req: Request, res: Response) => {
    const userId = req.userId
    if (userId == null)
        return res.status(401).json({ message: "Unauthorized: missing userId" })

    try {
        const { key, service } = validateSchema(addApiKeySchema, req.body)

        const existingKey = await findApiKeyForUser(userId, service)
        if (!existingKey)
            return res.status(404).json({ message: "API key for this service not found" })

        // Update the key
        const updatedKey = await updateApiKeyForUser(userId, service, key)
        res.status(200).json(updatedKey)
    } catch (error) {
        if (error instanceof ZodError) {
            return res.status(400).json({
                message: error.issues[0]?.message || "Validation failed",
                errors: error.issues
            })
        }
        console.error(error)
        res.status(500).json({ message: "Failed to update api key" })
    }
}

//delete api key, service sent in body
export const deleteApiKey = async (req: Request, res: Response) => {
    const userId = req.userId
    if (userId == null)
        return res.status(401).json({ message: "Unauthorized: missing userId" })

    const { service } = req.body
    if (!service)
        return res.status(400).json({ message: "Missing service in request body" })

    try {
        const existingKey = await findApiKeyForUser(userId, service)
        if (!existingKey)
            return res.status(404).json({ message: "API key for this service not found" })

        await deleteApiKeyForUser(userId, service)
        res.status(200).json({ message: `${service} API deleted`})
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: "Failed to delete api key" })
    }
}