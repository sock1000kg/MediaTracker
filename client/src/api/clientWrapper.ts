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

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  let token = localStorage.getItem("accessToken")

  if (!token) {
    if (navigateFunction) {
      logout()
      return Promise.reject(new Error("No token found"))
    }
    throw new Error("No token found")
  }

  try {
    const API_BASE = import.meta.env.VITE_API_URL
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
          const refreshToken = localStorage.getItem("refreshToken")

          if (!refreshToken) {
            logout()
            throw new Error("Session expired")
          }

          const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: refreshToken }),
          })

          if (refreshRes.ok) {
            const data = await refreshRes.json()
            localStorage.setItem("accessToken", data.accessToken)
            localStorage.setItem("refreshToken", data.refreshToken)
            
            // Retry the original request with the new token
            res = await fetch(`${API_BASE}${url}`, {
              ...options,
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${data.accessToken}`,
                ...(options.headers || {}),
              },
            })
          } else {
            logout()
            throw new Error("Session expired")
          }
      }   
      
      if (!res.ok) {
        let errorMessage = "Unknown error"
        const data = await res.json()
        errorMessage = data.message || JSON.stringify(data)
        throw new Error(errorMessage)
      }

    return res.json()

  } catch(error: any) {
    throw new Error(error.message)
  }
}