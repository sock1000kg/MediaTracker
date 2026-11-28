import express from "express"
import {
  getLogs,
  createNewLog,
  updateExistingLog,
  deleteExistingLog,
  createLogEntry,
  updateLogEntry,
  deleteLogEntry,
} from "@/api/controllers/logControllers.js"

const router = express.Router()

// Get all logs for user
router.get("/", getLogs)

// Create new log tied to user (need mediaId)
router.post("/", createNewLog)

// Update log (need logId)
router.put("/:id", updateExistingLog)

// Delete log
router.delete("/:id", deleteExistingLog)

// Entries of a log (one dated read, watch, listen or play)
router.post("/:id/entries", createLogEntry)
router.put("/:id/entries/:entryId", updateLogEntry)
router.delete("/:id/entries/:entryId", deleteLogEntry)

export default router
