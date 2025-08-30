export async function fetchMediaTypes(token: string) {
  const res = await fetch("http://localhost:5000/media-type", {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  })

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw {
        status: res.status,
        message: errData.message || "Failed to fetch media types",
    }
  }

  return res.json()
}


export async function createMediaType(name: string, token: string | null) {
    const res = await fetch("http://localhost:5000/media-type", {
        method: "POST",
        headers: { 
            "Content-Type": "application/json", 
            Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ name }),
    })

    if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw {
            status: res.status,
            message: errData.message || "Failed to create media type",
        }
    }

    return res.json()
}