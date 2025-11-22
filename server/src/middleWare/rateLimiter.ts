import { Request, Response, NextFunction, RequestHandler } from "express"
import rateLimit, { ipKeyGenerator } from "express-rate-limit"

const createLimiter =  (enabled: boolean, options: Parameters<typeof rateLimit>[0]): RequestHandler => {
    if (!enabled) {
        // Return no-op middleware
        return (req: Request, res: Response, next: NextFunction) => next()
    }
    return rateLimit(options);
};

//Turn on/off rate limiter in env
const RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED === "true"

export const globalLimiter = createLimiter(RATE_LIMIT_ENABLED, {
    windowMs: 60 * 1000,
    max: 30,
    keyGenerator: (req) => {
        if (req.userId !== undefined) return `user-${req.userId}`;
        if (req.ip !== undefined) return ipKeyGenerator(req.ip);
        return ipKeyGenerator("unknown");
    },
    message: { message: "Too many requests" }
});

export const signupLimiter = createLimiter(RATE_LIMIT_ENABLED, {
    windowMs: 60 * 60 * 1000,
    max: 3,
    keyGenerator: req => ipKeyGenerator(req.ip || "unknown"),
    message: { message: "Too many signup attempts" }
});

export const loginLimiter = createLimiter(RATE_LIMIT_ENABLED, {
    windowMs: 10 * 60 * 1000,
    max: 5,
    keyGenerator: req => ipKeyGenerator(req.ip || "unknown"),
    message: { message: "Too many login attempts" }
});
