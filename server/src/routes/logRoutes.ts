import express from "express"
import {
  getLogs,
  createNewLog,
  updateExistingLog,
  deleteExistingLog,
} from "@/controllers/logControllers.js"

const router = express.Router()

// Get all logs for user
router.get("/", getLogs)

// Create new log tied to user (need mediaId)
router.post("/", createNewLog)

// Update log (need logId)
router.put("/:id", updateExistingLog)

// Delete log
router.delete("/:id", deleteExistingLog)

export default router
