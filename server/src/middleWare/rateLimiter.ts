import rateLimit, { ipKeyGenerator, RateLimitRequestHandler } from "express-rate-limit"


export const globalLimiter= rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30,
    keyGenerator: (req) => {
        if (req.userId !== undefined) return `user-${ req.userId.toString() }`
        if (req.ip !== undefined) return ipKeyGenerator(req.ip)
        return ipKeyGenerator('unknown')
    },
    message: { error: 'Too many requests' }
})

export const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 signup attempts per IP per hour
    message: { error: "Too many signup attempts, please try again later" },
    keyGenerator: req => ipKeyGenerator(req.ip || "unknown")
})

export const loginLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 5,
    message: { error: "Too many login attempts" },
    keyGenerator: req => ipKeyGenerator(req.ip || "unknown")
})
