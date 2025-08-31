import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom" 

import { fetchLogs } from "@/api/logs"

import { Button } from "@/components/ui/button"
import LogsSection from "@/components/sections/LogSection"
import MediasSection from "@/components/sections/MediaSection"
import MediaTypesSection from "@/components/sections/MediaTypeSection"

import type { Log } from "@/types/media.ts"
import type { Tab } from "@/types/media.ts"

export default function Homepage() {
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>("logs")

  const navigate = useNavigate()

  const token = localStorage.getItem("token")
  //Check authorization
  useEffect(() => {
    // Check authorization 
    if (!token) {
      navigate("/login")
      return
    }
  }, [activeTab])

  // Fetch logs on mount
  useEffect(() => {
    const loadLogs = async () => {
      try {
        const data = await fetchLogs(token)
        setLogs(data)
      } catch (error: any) {
        if (error.status === 401) {
          localStorage.removeItem("token")
          navigate("/login")
        } else {
          console.error("Unexpected error:", error.message)
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
        <div className="flex min-h-screen bg-stone-100"> 

          {/* Display user's contents */}
          <div className="flex-1 space-y-8">
            {activeTab === "logs" && <LogsSection groupedLogs={groupedLogs} />}
            {activeTab === "medias" && <MediasSection />}
            {activeTab === "mediaTypes" && <MediaTypesSection />}
          </div>

          {/* Right side bar */}
          <div className="flex flex-col w-40 bg-stone-300 space-y-4">
            <Button 
              variant={activeTab === "logs" ? "boldedLink" : "link"}
              className="text-stone-600 w-full rounded-none shadow-[0_2px_2px_-2px_rgba(0,0,0,0.2)] hover:underline" 
              onClick={() => { setActiveTab("logs")}}
            >
                Your Logs
            </Button>
            <Button 
              variant={activeTab === "medias" ? "boldedLink" : "link"}
              className="text-stone-600 w-full rounded-none shadow-[0_2px_2px_-2px_rgba(0,0,0,0.2)] hover:underline" 
              onClick={() => { setActiveTab("medias")}}
            >
                Your Medias
            </Button>
            <Button 
              variant={activeTab === "mediaTypes" ? "boldedLink" : "link"}
              className="text-stone-600 w-full rounded-none shadow-[0_2px_2px_-2px_rgba(0,0,0,0.2)] hover:underline" 
              onClick={() => { setActiveTab("mediaTypes")}}
            >
                Your Media Types
            </Button>
          </div>
        </div>

      }
    </>
  )
}
