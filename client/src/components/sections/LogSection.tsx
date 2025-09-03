import { useEffect, useState } from "react"

import { fetchLogs } from "@/api/logs"

import { Button } from "@/components/ui/button"
import { LogCard } from "@/components/cards/LogCard"
import { MediaTypeCard } from "@/components/cards/MediaTypeGroupCard"
import type { Log } from "@/types/media"

export default function LogsSection() {
  const [logs, setLogs] = useState<Log[]>([])
   const [loading, setLoading] = useState(true)

  // Fetch logs on mount
  useEffect(() => {
    const loadLogs = async () => {
      try {
        const data = await fetchLogs()
        setLogs(data)
      } catch (error: any) {
          console.error("Unexpected error:", error.message)
      } finally {
        setLoading(false)
      }
    }

    loadLogs()
  }, [])

  const handleCreated = (newLog: Log) => {
    setLogs(prev => [...prev, newLog])
  }

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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between p-4 items-center bg-stone-200">
        <div>
          <p className="text-lg font-semibold">Your Logs</p>
          <p className="text-sm text-gray-600">List of Logs you have created</p>
        </div>
        <Button size="default" variant="amber">
          + Add Log
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
        {loading && <p className="text-gray-50 m-4">Loading logs...</p>}
      

        {!(logs.length > 0) && !loading && <p className=" text-gray-600">You have no logs. Create one!</p>}
        {!loading && (logs.length > 0) && (
          <ul className="space-y-2">
            {Object.entries(groupedLogs).map(([type, typeLogs]) => (
              <MediaTypeCard key={type} type={type}>
                {typeLogs.map((log) => (
                  <LogCard key={log.id} log={log} />
                ))}
              </MediaTypeCard>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
