//Allow apiFetch to access navigate() depsite being outside of React
let navigateFunction: ((path: string) => void) | null = null

export function setNavigate(navigate: (path: string) => void) {
  navigateFunction = navigate
}

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("token")

  if (!token) {
    if (navigateFunction) {
      navigateFunction("/login")
      return Promise.reject(new Error("No token found"))
    }
    throw new Error("No token found")
  }

  try {
    const API_BASE = import.meta.env.VITE_API_URL
    const res = await fetch(`${API_BASE}${url}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    }) 

    console.log(res.status, res.headers.get("content-type"))
    if (!res.ok) {
        if (res.status === 401) {
            localStorage.removeItem("token")
            if (navigateFunction) {
              navigateFunction("/login")
              return Promise.reject(new Error("Unauthorized"))
            }
        }   
        
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