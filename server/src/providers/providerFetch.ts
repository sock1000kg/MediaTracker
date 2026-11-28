import { AppError } from "@/api/domain/error.js"
import { createUserAgentHeader } from "@/utilities.js"
import { parseRetryAfter, defaultClock } from "@/services/search/rateLimiter.js"
import { ProviderName, getProviderEntry } from "./registry.js"
import { getAuthStrategy, getUserApiKey } from "./auth.js"

export interface ProviderFetchInit extends RequestInit {
    userId?: string
    apiKey?: string
    userApiKey?: string
    timeoutMs?: number
    allow404?: boolean
    allowHttpErrors?: boolean
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
    const target = name.toLowerCase()
    return Object.keys(headers).some(k => k.toLowerCase() === target)
}

function setHeader(headers: Record<string, string>, name: string, value: string) {
    const target = name.toLowerCase()
    for (const k of Object.keys(headers)) {
        if (k.toLowerCase() === target) delete headers[k]
    }
    headers[name] = value
}

// A key may only ever be sent to the provider's own host (or a subdomain of it)
function assertProviderHost(name: ProviderName, url: URL) {
    const entry = getProviderEntry(name)
    const allowed = [entry.host, ...(entry.hosts ?? [])]
    const host = url.hostname.toLowerCase()
    if (!allowed.some(h => host === h || host.endsWith(`.${h}`))) {
        throw new Error(`providerFetch(${name}): host ${host} is not a ${entry.displayName} host`)
    }
}

/**
 * Single entry point for every external provider HTTP call.
 * Applies in order:
 *  1. Limiter
 *  2. User-Agent
 *  3. Host check, then auth from the user's key (scheme named by the registry)
 *  4. Timeout
 *  5. Retry-After-aware retry on the registry's retry statuses
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

        // 3. Host check, then auth
        const reqUrl = new URL(url.toString())
        assertProviderHost(name, reqUrl)
        if (entry.auth) {
            const strategy = getAuthStrategy(entry.auth)
            let key = init?.apiKey ?? init?.userApiKey
            if (!key && init?.userId) {
                key = await getUserApiKey(name, init.userId)
            }

            if (key) {
                strategy.apply(reqUrl, plainHeaders, key)
            } else if (!strategy.isPresent(reqUrl, plainHeaders)) {
                throw new AppError(entry.missingKeyMessage ?? "Missing API Key", 404)
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
        const attempt = async (): Promise<Response> => {
            try {
                return await fetch(targetUrl, { ...fetchInit, signal: makeSignal() })
            } catch (err) {
                if (init?.allowHttpErrors) throw err
                throw new AppError("Provider is unavailable", 503)
            }
        }

        let res = await attempt()
        const policy = entry.retryPolicy
        for (let i = 0; policy && i < policy.retries && policy.onStatus.includes(res.status); i++) {
            const delay = parseRetryAfter(res, 1000, 30000)
            if (entry.limiter) {
                entry.limiter.pause(delay)
                await entry.limiter.sleep(delay)
            } else {
                await defaultClock.sleep(delay)
            }
            res = await attempt()
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
