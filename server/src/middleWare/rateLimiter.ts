import { Request, Response, NextFunction, RequestHandler } from "express"
import rateLimit, { ipKeyGenerator } from "express-rate-limit"

const createLimiter = (options: Parameters<typeof rateLimit>[0]): RequestHandler => {
    if (process.env.RATE_LIMIT_ENABLED !== 'true') {
        // Return no-op middleware
        return (req: Request, res: Response, next: NextFunction) => next()
    }
    return rateLimit(options)
};

export const globalLimiter = createLimiter({
    windowMs: 60 * 1000,
    max: 30,
    keyGenerator: (req) => {
        if (req.userId !== undefined) return `user-${req.userId}`

        // Check for the actual IP sent by CF edge
        const cfIp = req.headers['cf-connecting-ip']
        if (cfIp) return ipKeyGenerator(Array.isArray(cfIp) ? cfIp[0] : cfIp)

        return ipKeyGenerator(req.ip || "unknown")
    },
    message: { message: "Too many requests" }
})

export const signupLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    max: 3,
    keyGenerator: (req) => {
        const cfIp = req.headers['cf-connecting-ip']
        if (cfIp) return ipKeyGenerator(Array.isArray(cfIp) ? cfIp[0] : cfIp)
        return ipKeyGenerator(req.ip || "unknown")
    },
    message: { message: "Too many signup attempts" }
})

export const loginLimiter = createLimiter({
    windowMs: 10 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => {
        const cfIp = req.headers['cf-connecting-ip']
        if (cfIp) return ipKeyGenerator(Array.isArray(cfIp) ? cfIp[0] : cfIp)
        return ipKeyGenerator(req.ip || "unknown")
    },
    message: { message: "Too many login attempts" }
})
