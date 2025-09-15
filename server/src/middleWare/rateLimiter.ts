import rateLimit, { ipKeyGenerator, RateLimitRequestHandler } from "express-rate-limit"

export const limiter: RateLimitRequestHandler = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30,
    keyGenerator: (req) => {
        if (req.ip !== undefined) return ipKeyGenerator(req.ip)
        return ipKeyGenerator('unknown')
    },
    message: { error: 'Too many requests' }
})