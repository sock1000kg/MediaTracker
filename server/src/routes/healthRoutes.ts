import { healthCheck } from "@/controllers/healthController.js"
import express from "express"

const router = express.Router()

router.post("/", healthCheck)

export default router