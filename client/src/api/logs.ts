export async function fetchLogs(token: string) {
    const res = await fetch("http://localhost:5000/logs", {
        headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
        
        const errData = await res.json().catch(() => ({}))
        throw {
            status: res.status,
            message: errData.message || "Failed to fetch logs",
        }
    }

    return res.json() // returns the parsed logs
}


export async function createLog(log: { mediaId: number, status: string, rating: number | null, notes: string }, token: string) {
    const res = await fetch("http://localhost:5000/api/logs", {
        method: "POST",
        headers: { 
            "Content-Type": "application/json", 
            Authorization: `Bearer ${token}`},
        body: JSON.stringify(log),
    })
    if (!res.ok) {

        const errData = await res.json().catch(() => ({}))
        throw {
            status: res.status,
            message: errData.message || "Failed to create logs",
        }
    }
        
    return res.json()
}