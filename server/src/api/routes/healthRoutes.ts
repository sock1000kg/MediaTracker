import { healthCheck } from "@/api/controllers/healthController.js"
import express from "express"

const router = express.Router()

router.get("/", healthCheck)

router.get("/ip", (req, res) => {
    res.json({
        cfConnectingIp: req.headers['cf-connecting-ip'],
        xForwardedFor: req.headers['x-forwarded-for'],
        reqIp: req.ip,
        socketRemote: req.socket.remoteAddress,
        trusted: req.ips,
    })
})

export default router