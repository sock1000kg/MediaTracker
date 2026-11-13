const API_BASE = import.meta.env.VITE_API_URL

//Allow apiFetch to access navigate() depsite being outside of React
let navigateFunction: ((path: string) => void) | null = null

export function setNavigate(navigate: (path: string) => void) {
  navigateFunction = navigate
}

let onLogoutFunction: (() => void) | null = null

/** Lets the app register a cache clear that runs on every logout (including forced ones). */
export function setOnLogout(fn: (() => void) | null) {
  onLogoutFunction = fn
}

const TOKEN_KEY = "accessToken"

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function writeToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // storage unavailable: the token still works for the retries below
  }
}

const logout = () => {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // storage unavailable: ignore
  }
  onLogoutFunction?.()
  if (navigateFunction) navigateFunction("/login")
}

/** Calls the refresh endpoint. Resolves to the new token, or null on failure (it does not log out). */
async function callRefreshEndpoint(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include", // Send the HttpOnly refresh cookie
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.accessToken) return null
    writeToken(data.accessToken)
    return data.accessToken as string
  } catch {
    return null
  }
}

/** Runs `fn` under a cross-tab lock when the browser has Web Locks, otherwise just runs it. */
function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined
  return locks ? locks.request("mt-auth-refresh", fn) : fn()
}

// One refresh at a time per tab: every request that gets a 401 awaits the same promise,
// because the server rotates the refresh token and a second concurrent refresh would be rejected.
let refreshPromise: Promise<string | null> | null = null

/**
 * Single-flight token refresh. `staleToken` is the token the caller's 401 was for: if another tab
 * already stored a different one while we waited for the lock, use it instead of refreshing again.
 * Logs out at most once per failed refresh.
 */
function refreshAccessToken(staleToken: string): Promise<string | null> {
  if (refreshPromise) return refreshPromise
  const p = withRefreshLock(async () => {
    const current = readToken()
    if (current && current !== staleToken) return current
    return callRefreshEndpoint()
  })
    .then((token) => {
      if (!token) logout()
      return token
    })
    .finally(() => {
      refreshPromise = null
    })
  refreshPromise = p
  return p
}

function buildHeaders(token: string, options: RequestInit): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    ...(options.headers as Record<string, string> | undefined),
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
  }
}

/**
 * Authenticated fetch that returns the raw Response (any status except a final 401,
 * which logs out). Handles 401 -> refresh -> retry once.
 */
export async function apiFetchRaw(url: string, options: RequestInit = {}): Promise<Response> {
  const token = readToken()

  if (!token) {
    if (navigateFunction) {
      logout()
      return Promise.reject(new Error("No token found"))
    }
    throw new Error("No token found")
  }

  let res = await fetch(`${API_BASE}${url}`, { ...options, headers: buildHeaders(token, options) })

  if (res.status === 401) {
    const newToken = await refreshAccessToken(token)
    if (!newToken) {
      throw new Error("Session expired")
    }
    // Retry the original request exactly once with the new token
    res = await fetch(`${API_BASE}${url}`, { ...options, headers: buildHeaders(newToken, options) })
  }
  return res
}

/** Error thrown by apiFetch for non-2xx responses; `status` and `data` (parsed JSON body) are optional extras. */
export class ApiError extends Error {
  status?: number
  data?: unknown
  constructor(message: string, status?: number, data?: unknown) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.data = data
  }
}

async function errorFrom(res: Response): Promise<ApiError> {
  try {
    const data = await res.json()
    return new ApiError(data?.message || JSON.stringify(data) || "Unknown error", res.status, data)
  } catch {
    return new ApiError(res.statusText || `Request failed (${res.status})`, res.status)
  }
}

async function errorMessageFrom(res: Response): Promise<string> {
  return (await errorFrom(res)).message
}

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  try {
    const res = await apiFetchRaw(url, options)

    if (!res.ok) throw await errorFrom(res)

    if (res.status === 204) return {} as T
    return await res.json()
  } catch (error: unknown) {
    if (error instanceof ApiError) throw error
    const msg = error instanceof Error ? error.message : "Unknown error"
    throw new Error(msg)
  }
}

/** Same as apiFetchRaw but throws Error(message) for non-2xx. Used for blob downloads. */
export async function apiFetchOk(url: string, options: RequestInit = {}): Promise<Response> {
  const res = await apiFetchRaw(url, options)
  if (!res.ok) throw new Error(await errorMessageFrom(res))
  return res
}
