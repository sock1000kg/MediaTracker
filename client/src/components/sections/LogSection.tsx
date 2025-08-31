import { useEffect, useState } from "react"

import { fetchLogs } from "@/api/logs"

import { Button } from "@/components/ui/button"
import { LogCard } from "@/components/cards/LogCard"
import { MediaTypeCard } from "@/components/cards/MediaTypeCard"
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex p-4 justify-between w-full items-center">
        <div>
          <p className="text-lg font-semibold">Your Logs</p>
          <p className="text-sm text-gray-600">List of Logs you have created</p>
        </div>
        <Button size="default" variant="amber">
          + Add Log
        </Button>
      </div>

      {loading && <p className="text-gray-500">Loading logs...</p>}
      
      {!loading && (
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
  )
}
