import express from "express"
import { getJob, listJobs } from "@/api/controllers/jobController.js"

const router = express.Router()

router.get('/', listJobs)
router.get('/:id', getJob)

export default router
