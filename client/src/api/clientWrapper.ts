const API_BASE = import.meta.env.VITE_API_URL

//Allow apiFetch to access navigate() depsite being outside of React
let navigateFunction: ((path: string) => void) | null = null

export function setNavigate(navigate: (path: string) => void) {
  navigateFunction = navigate
}

const logout = () => {
  localStorage.removeItem("accessToken")
  localStorage.removeItem("refreshToken")
  if (navigateFunction) navigateFunction("/login")
}

//Helper to call refresh endpoint
async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include", // Send the HttpOnly refresh cookie
    })
    
    if (!res.ok) throw new Error("Refresh failed")
    
    const data = await res.json()
    localStorage.setItem("accessToken", data.accessToken)
    return data.accessToken
  } catch {
    logout()
    return null
  }
}

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("accessToken")

  if (!token) {
    if (navigateFunction) {
      logout()
      return Promise.reject(new Error("No token found"))
    }
    throw new Error("No token found")
  }

  try {
    let res = await fetch(`${API_BASE}${url}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    }) 

    console.log(res.status, res.headers.get("content-type"))
    if (res.status === 401) {
      const newToken = await refreshAccessToken()

      if (newToken) {
        // Retry the original request exactly once with the new token
        res = await fetch(`${API_BASE}${url}`, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${newToken}`,
                ...(options.headers || {}),
            },
        })
      } else {
        logout()
        throw new Error("Session expired")
      }
    }   
      
    if (!res.ok) {
      const data = await res.json()
      const errorMessage = data.message || JSON.stringify(data)
      throw new Error(errorMessage || "Unknown error")
    }

    if (res.status === 204) return {} as T
    return res.json()

  } catch(error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error"
    throw new Error(msg)
  }
}