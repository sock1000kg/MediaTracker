import { AppError } from "@/api/domain/error.js"
import { decryptKey } from "@/utilities.js"
import { findApiKeyForUser } from "@/repositories/apiKeyRepository.js"
import { getProviderEntry, type ProviderName } from "./registry.js"

/**
 * How a provider expects its key. The registry names a scheme per provider; providerFetch applies it
 * and knows nothing about individual providers.
 */
export type AuthConfig =
    | { scheme: "query"; param: string }
    | { scheme: "bearer" }
    | { scheme: "tmdb" }

export type AuthHeaders = Record<string, string>

export interface AuthStrategy {
    apply(url: URL, headers: AuthHeaders, key: string): void
    /** True when the request already carries credentials (e.g. a caller built the URL with a key). */
    isPresent(url: URL, headers: AuthHeaders): boolean
}

function hasHeader(headers: AuthHeaders, name: string): boolean {
    const target = name.toLowerCase()
    return Object.keys(headers).some(k => k.toLowerCase() === target)
}

function setHeader(headers: AuthHeaders, name: string, value: string) {
    const target = name.toLowerCase()
    for (const k of Object.keys(headers)) {
        if (k.toLowerCase() === target) delete headers[k]
    }
    headers[name] = value
}

const bearer: AuthStrategy = {
    apply: (_url, headers, key) => setHeader(headers, "Authorization", `Bearer ${key.trim()}`),
    isPresent: (_url, headers) => hasHeader(headers, "Authorization"),
}

function query(param: string): AuthStrategy {
    return {
        apply: (url, _headers, key) => { url.searchParams.set(param, key.trim()) },
        isPresent: (url) => url.searchParams.has(param),
    }
}

// A v4 read access token is a JWT (eyJ... with two dots): sent as a bearer. Anything else is a v3 api_key.
const tmdb: AuthStrategy = {
    apply(url, headers, key) {
        const k = key.trim()
        if (k.startsWith("eyJ") && k.split(".").length === 3) bearer.apply(url, headers, k)
        else url.searchParams.set("api_key", k)
    },
    isPresent: (url, headers) => url.searchParams.has("api_key") || hasHeader(headers, "Authorization"),
}

export function getAuthStrategy(config: AuthConfig): AuthStrategy {
    switch (config.scheme) {
        case "query": return query(config.param)
        case "bearer": return bearer
        case "tmdb": return tmdb
    }
}

/**
 * Retrieves the user's decrypted API key for a keyed provider (only the matching key is decrypted).
 * Strictly Bring Your Own Key: NEVER falls back to environment variables.
 */
export async function getUserApiKey(name: ProviderName, userId?: string): Promise<string> {
    const provider = getProviderEntry(name)
    if (!provider.keyService) {
        throw new Error(`Provider ${name} does not use an API key`)
    }

    if (!userId) {
        throw new AppError(provider.missingKeyMessage ?? "Missing API Key", 404)
    }

    const row = await findApiKeyForUser(userId, provider.keyService)
    const key = row ? decryptKey(row.key) : null

    if (!key || !key.trim()) {
        throw new AppError(provider.missingKeyMessage ?? "Missing API Key", 404)
    }

    return key.trim()
}
