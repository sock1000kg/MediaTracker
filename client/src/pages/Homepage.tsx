import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom" 

import { fetchLogs } from "@/api/logs"

import { Button } from "@/components/ui/button"
import { LogCard } from "@/components/LogCard"
import { MediaTypeCard } from "@/components/MediaTypeCard"
import MediaTypeForm from "@/components/MediaTypeForm"

import type { Log } from "@/types/media.ts"
import type { DialogName } from "@/types/media.ts"

export default function Homepage() {
  const [openDialog, setOpenDialog] = useState<DialogName>(null)
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(true)
  const [mediaTypeError, setMediaTypeError] = useState<string | null>(null)

  const navigate = useNavigate()

  // fetch logs on mount
  useEffect(() => {
    const token = localStorage.getItem("token")
    if (!token) {
      navigate("/login")
      return
    }

    const loadLogs = async () => {
      try {
        const data = await fetchLogs(token)
        setLogs(data)
      } catch (err: any) {
        if (err.status === 401) {
          localStorage.removeItem("token")
          navigate("/login")
        } else {
          console.error("Unexpected error:", err.message)
        }
      } finally {
        setLoading(false)
      }
    }

    loadLogs()
  }, [navigate])


  // Group logs by media type
  // Go through each log and see if the array acc contains its type, ex: acc["book"]
  // Then add the log to the acc array according to type, ex: acc["book"][log1, log2]
  const groupedLogs = logs.reduce((acc, log) => {
    const type = log.media.mediaType.name

    if (!acc[type]) acc[type] = [] //Create empty type array if type doesnt exist
    acc[type].push(log)

    return acc
  }, {} as Record<string, Log[]>) //<key,value> object

  return (
    <>
      {/* Loading screen */}
      {loading && 
        <div className="flex h-screen w-screen items-center justify-center">
          <p className="text-lg">Loading your logs...</p>
        </div>}
        
      {!loading && 
        <div className="p-6 space-y-8 min-h-screen bg-stone-100"> 

          {/* Display user's logs */}
          <div className="space-y-8">
            {/* Sort logs according to type, groupedLogs is converted into an array of [key,value] */}
            {Object.entries(groupedLogs).map(([type, typeLogs]) => (
              <MediaTypeCard key={type} type={type}>
                {typeLogs.map((log) => (
                  <LogCard key={log.id} log={log} />
                ))}
              </MediaTypeCard>
            ))}
          </div>

          {/* Adding button  */}
          <Button variant="outline">+ Add Log</Button>
          <Button variant="outline">+ Add Media</Button>
          <Button variant="outline" onClick={() => setOpenDialog("mediaTypeForm")}>+ Add Media Type</Button>

          <MediaTypeForm 
            open={openDialog}
            onOpenChange={setOpenDialog}
            onCreated={(newType) => {
              console.log("Created new Media Type:", newType)
              setMediaTypeError(null) // clear errors if successful
            }}
            error={mediaTypeError}
            setError={setMediaTypeError}
          />
        </div>
      }
    </>
  )
}
