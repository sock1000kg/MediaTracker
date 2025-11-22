import express from "express"
import { registerUser, loginUser } from "@/api/controllers/authControllers.js"
import { loginLimiter, signupLimiter } from "@/middleWare/rateLimiter.js"

const router = express.Router()

router.post("/register", signupLimiter, registerUser)

router.post("/login", loginLimiter, loginUser) 

export default router
