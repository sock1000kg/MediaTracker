import { AppError } from "@/api/domain/error.js"
import { createUserAgentHeader } from "@/utilities.js"
import { parseRetryAfter, defaultClock } from "@/services/search/rateLimiter.js"
import {
    ProviderName,
    getProviderEntry,
    getUserApiKey,
} from "./registry.js"

export interface ProviderFetchInit extends RequestInit {
    userId?: string
    apiKey?: string
    userApiKey?: string
    timeoutMs?: number
    allow404?: boolean
    allowHttpErrors?: boolean
}

function setHeader(headers: Record<string, string>, name: string, value: string) {
    const target = name.toLowerCase()
    for (const k of Object.keys(headers)) {
        if (k.toLowerCase() === target) delete headers[k]
    }
    headers[name] = value
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
    const target = name.toLowerCase()
    return Object.keys(headers).some(k => k.toLowerCase() === target)
}

/**
 * Single entry point for every external provider HTTP call.
 * Applies in order:
 *  1. Limiter
 *  2. User-Agent
 *  3. Auth from user's key (where registry says needed)
 *  4. Timeout
 *  5. One Retry-After-aware retry on 429/503
 *  6. Typed errors (missing key -> 404, down -> 503, not found -> 404)
 */
export async function providerFetch(
    name: ProviderName,
    url: string | URL,
    init?: ProviderFetchInit
): Promise<Response> {
    const entry = getProviderEntry(name)

    const execute = async (): Promise<Response> => {
        // Collect plain headers object preserving caller / standard casing for tests and proxies
        const plainHeaders: Record<string, string> = {}
        if (init?.headers) {
            if (init.headers instanceof Headers) {
                init.headers.forEach((v, k) => { plainHeaders[k] = v })
            } else if (Array.isArray(init.headers)) {
                for (const [k, v] of init.headers) plainHeaders[k] = v
            } else {
                Object.assign(plainHeaders, init.headers)
            }
        }

        // 2. User-Agent
        if (!hasHeader(plainHeaders, "User-Agent")) {
            const uaObj = createUserAgentHeader()
            const ua = (uaObj.headers as Record<string, string> | undefined)?.["User-Agent"]
            if (ua) setHeader(plainHeaders, "User-Agent", ua)
        }

        // 3. Auth
        const reqUrl = new URL(url.toString())
        if (entry.keyService) {
            let key = init?.apiKey ?? init?.userApiKey
            if (!key && init?.userId) {
                key = await getUserApiKey(name, init.userId)
            }

            if (key) {
                if (name === "tmdb") {
                    const k = key.trim()
                    if (k.startsWith("eyJ") && k.split(".").length === 3) {
                        setHeader(plainHeaders, "Authorization", `Bearer ${k}`)
                    } else {
                        reqUrl.searchParams.set("api_key", k)
                    }
                } else if (name === "rawg") {
                    reqUrl.searchParams.set("key", key.trim())
                } else if (name === "bgg") {
                    setHeader(plainHeaders, "Authorization", `Bearer ${key.trim()}`)
                } else if (name === "lastfm") {
                    reqUrl.searchParams.set("api_key", key.trim())
                }
            } else {
                // Check if auth is already baked into URL or headers
                const hasParamAuth =
                    (name === "tmdb" && reqUrl.searchParams.has("api_key")) ||
                    (name === "rawg" && reqUrl.searchParams.has("key")) ||
                    (name === "lastfm" && reqUrl.searchParams.has("api_key"))
                const hasHeaderAuth = hasHeader(plainHeaders, "Authorization") || hasHeader(plainHeaders, "X-BGG-Token")

                if (!hasParamAuth && !hasHeaderAuth) {
                    throw new AppError(entry.missingKeyMessage ?? "Missing API Key", 404)
                }
            }
        }

        // 4. Timeout & request init helper
        const timeoutMs = init?.timeoutMs ?? entry.timeoutMs ?? 8000
        const makeSignal = () => {
            const timeoutSignal = AbortSignal.timeout(timeoutMs)
            if (init?.signal) {
                return AbortSignal.any([init.signal, timeoutSignal])
            }
            return timeoutSignal
        }

        const fetchInit: RequestInit = {
            ...init,
            headers: plainHeaders,
            signal: makeSignal(),
        }

        const targetUrl = (typeof url === "string" && !url.endsWith("/") && reqUrl.origin + "/" === reqUrl.toString())
            ? url
            : reqUrl.toString()

        // 5. One Retry-After-aware retry on 429/503
        let res: Response
        try {
            res = await fetch(targetUrl, fetchInit)
        } catch (err) {
            if (init?.allowHttpErrors) throw err
            throw new AppError("Provider is unavailable", 503)
        }

        if ((res.status === 429 || res.status === 503) && entry.retryPolicy && entry.retryPolicy.retries > 0) {
            const delay = parseRetryAfter(res, 1000, 30000)
            if (entry.limiter) {
                entry.limiter.pause(delay)
                await entry.limiter.sleep(delay)
            } else {
                await defaultClock.sleep(delay)
            }

            try {
                res = await fetch(targetUrl, {
                    ...fetchInit,
                    signal: makeSignal(),
                })
            } catch (err) {
                if (init?.allowHttpErrors) throw err
                throw new AppError("Provider is unavailable", 503)
            }
        }

        // 6. Typed errors
        if (init?.allowHttpErrors) {
            return res
        }

        if (res.status === 404) {
            if (init?.allow404) {
                return res
            }
            throw new AppError("The provider no longer has this item", 404)
        }

        if (res.status === 429 || res.status === 503 || !res.ok) {
            throw new AppError("Provider is unavailable", 503)
        }

        return res
    }

    // 1. Limiter
    if (entry.limiter) {
        return entry.limiter.schedule(execute)
    }
    return execute()
}
