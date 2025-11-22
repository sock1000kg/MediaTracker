import { addApiKey, deleteApiKey, getApiKeys, updateApiKey } from "@/api/controllers/apiKeyController.js"
import express from "express"

const router = express.Router()

router.get('/', getApiKeys)
router.post('/', addApiKey)
router.put('/', updateApiKey)
router.delete('/', deleteApiKey)

export default router