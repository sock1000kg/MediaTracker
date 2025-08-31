export async function apiFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem("token")

  if (!token) {
    throw new Error("No token found") // Frontend UX: parent can handle this
  }

  try{
    const res = await fetch(`http://localhost:5000${url}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...(options.headers || {}),
        },
    }) 
    if (!res.ok) {
        if (res.status === 401) {
            localStorage.removeItem("token")
        }   
        const errorMessage = await res.text()
        throw new Error(errorMessage)
    }

    return res.json()
  }catch(error: any) {
    throw new Error(error.message)
  }

}