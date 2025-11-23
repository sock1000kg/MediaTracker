import { NextFunction, Request, Response } from "express"
import { apiKeyService } from "@/services/apiKeyService.js"

//Get all api keys (encrypted) based on userId
export const getApiKeys = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (userId == null) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    try {
        const apiKeys = await apiKeyService.getAll(userId)
        return res.status(200).json(apiKeys)
    }catch(error){
        next(error)
    }
}

//Create api key, key and service sent in body
export const addApiKey = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (userId == null) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    try{
        const apiKey = await apiKeyService.create(userId, req.body)
        res.status(201).json(apiKey)
    }catch(error){
        next(error)
    }
}

//Update api key, key and service sent in body
export const updateApiKey = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (userId == null) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    try {
        const updatedKey = await apiKeyService.update(userId, req.body)
        res.status(200).json(updatedKey)
    } catch (error) {
        next(error)
    }
}

//delete api key, service sent in body
export const deleteApiKey = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (userId == null) {
        return res.status(401).json({ message: "Unauthorized: missing userId" })
    }

    try {
        const result = await apiKeyService.delete(userId, req.body)
        res.status(200).json(result)
    } catch (error) {
        next(error)
    }
}