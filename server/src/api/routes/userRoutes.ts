import express from "express"
import { changePassword, deleteMe, exportMe, getMe, getPreferences, updateMe, updatePreferences } from "@/api/controllers/userController.js"
import { sensitiveLimiter } from "@/middleWare/rateLimiter.js"

const router = express.Router()

router.get('/me', getMe)
router.patch('/me', updateMe)
router.delete('/me', sensitiveLimiter, deleteMe)
router.put('/me/password', sensitiveLimiter, changePassword)
router.get('/me/preferences', getPreferences)
router.patch('/me/preferences', updatePreferences)
router.get('/me/export', exportMe)

export default router
