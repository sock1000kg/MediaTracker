import express from "express"
import { registerUser, loginUser, refreshToken } from "@/api/controllers/authControllers.js"
import { loginLimiter, signupLimiter } from "@/middleWare/rateLimiter.js"

const router = express.Router()

router.post("/register", signupLimiter, registerUser)

router.post("/login", loginLimiter, loginUser) 

router.post("/refresh", refreshToken)

export default router
