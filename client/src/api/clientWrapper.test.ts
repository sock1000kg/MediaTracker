import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { apiFetchRaw, setNavigate, setOnLogout, signOut } from "./clientWrapper"

const store = new Map<string, string>()
let refreshCalls = 0
let refreshOk = true
let logouts = 0
let seenAuth: string[] = []

function stubStorage() {
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
}

beforeEach(() => {
  store.clear()
  refreshCalls = 0
  refreshOk = true
  logouts = 0
  seenAuth = []
  stubStorage()
  vi.stubGlobal("navigator", {}) // no Web Locks
  vi.stubGlobal("fetch", async (url: string, init: { headers: Record<string, string> }) => {
    if (url.endsWith("/auth/refresh")) {
      refreshCalls++
      await new Promise((r) => setTimeout(r, 20))
      if (!refreshOk) return new Response("{}", { status: 401 })
      return new Response(JSON.stringify({ accessToken: "new" }), { status: 200 })
    }
    const auth = init.headers.Authorization
    seenAuth.push(auth)
    return new Response("{}", { status: auth === "Bearer new" ? 200 : 401 })
  })
  setOnLogout(() => { logouts++ })
  setNavigate(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  setOnLogout(null)
})

describe("apiFetchRaw single-flight refresh", () => {
  it("three concurrent 401s trigger one refresh; all retry with the new token; no logout", async () => {
    store.set("accessToken", "old")
    const rs = await Promise.all([apiFetchRaw("/a"), apiFetchRaw("/b"), apiFetchRaw("/c")])
    expect(rs.map((r) => r.status)).toEqual([200, 200, 200])
    expect(refreshCalls).toBe(1)
    expect(seenAuth.filter((a) => a === "Bearer new")).toHaveLength(3)
    expect(logouts).toBe(0)
    expect(store.get("accessToken")).toBe("new")
  })

  it("a later 401 starts a fresh refresh once the previous one settled", async () => {
    store.set("accessToken", "old")
    await apiFetchRaw("/x")
    expect(refreshCalls).toBe(1)
    store.set("accessToken", "old")
    await apiFetchRaw("/y")
    expect(refreshCalls).toBe(2)
  })

  it("a failed refresh logs out exactly once and rejects every caller", async () => {
    refreshOk = false
    store.set("accessToken", "old")
    const out = await Promise.allSettled([apiFetchRaw("/a"), apiFetchRaw("/b"), apiFetchRaw("/c")])
    expect(out.every((o) => o.status === "rejected")).toBe(true)
    expect(refreshCalls).toBe(1)
    expect(logouts).toBe(1)
    expect(store.has("accessToken")).toBe(false)
  })

  it("after a failure the next refresh can start again", async () => {
    refreshOk = false
    store.set("accessToken", "old")
    await Promise.allSettled([apiFetchRaw("/a")])
    refreshOk = true
    refreshCalls = 0
    store.set("accessToken", "old")
    expect((await apiFetchRaw("/z")).status).toBe(200)
    expect(refreshCalls).toBe(1)
  })

  it("cross-tab: if another tab already stored a new token under the lock, it does not refresh", async () => {
    let lockCalls = 0
    vi.stubGlobal("navigator", {
      locks: {
        request: async (_name: string, fn: () => Promise<unknown>) => {
          lockCalls++
          store.set("accessToken", "new") // the other tab finished first
          return fn()
        },
      },
    })
    store.set("accessToken", "old")
    expect((await apiFetchRaw("/y")).status).toBe(200)
    expect(lockCalls).toBe(1)
    expect(refreshCalls).toBe(0)
  })

  it("does not crash when storage throws", async () => {
    vi.stubGlobal("localStorage", {
      getItem() { throw new Error("x") },
      setItem() { throw new Error("x") },
      removeItem() { throw new Error("x") },
    })
    await expect(apiFetchRaw("/q")).rejects.toThrow()
  })

  it("without a token it logs out and rejects", async () => {
    await expect(apiFetchRaw("/a")).rejects.toThrow("No token found")
    expect(logouts).toBe(1)
  })
})

describe("signOut", () => {
  it("revokes the refresh token on the server, clears the token and runs the logout hook", async () => {
    const calls: string[] = []
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push(`${init.method} ${url} ${init.credentials}`)
      return new Response(null, { status: 204 })
    })
    const paths: string[] = []
    setNavigate((p) => paths.push(p))
    store.set("accessToken", "t")

    await signOut()

    expect(calls).toEqual([expect.stringMatching(/^POST .*\/auth\/logout include$/)])
    expect(store.has("accessToken")).toBe(false)
    expect(logouts).toBe(1)
    expect(paths).toEqual(["/login"])
  })

  it("still signs out locally when the server can't be reached", async () => {
    vi.stubGlobal("fetch", async () => { throw new TypeError("Failed to fetch") })
    store.set("accessToken", "t")

    await signOut()

    expect(store.has("accessToken")).toBe(false)
    expect(logouts).toBe(1)
  })
})
