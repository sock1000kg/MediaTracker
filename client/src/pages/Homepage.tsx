import { useEffect, useState } from "react"
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { LogCard } from "@/components/LogCard"
import type { Log } from "@/types/media.ts"

export default function Homepage() {
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(true)

  // fetch logs on mount
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch("http://localhost:5000/logs", {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        })

        const data = await res.json()
        setLogs(data)
      } catch (error) {
        console.error("Unexpected error:", error)
      } finally {
        setLoading(false)
      }
    }

    //Fetch once upon page load
    fetchLogs()
  }, [])


  // Group logs by media type
  // Go through each log and see if the array acc contains its type, ex: acc["book"]
  // Then add the log to the acc array according to type
  const groupedLogs = logs.reduce((acc, log) => {
    const type = log.media.mediaType.name

    if (!acc[type]) acc[type] = [] //Create empty type array if type doesnt exist
    acc[type].push(log)

    return acc
  }, {} as Record<string, Log[]>) //<key,value>

  return (
    <>
      {loading && 
        <div className="flex h-screen w-screen items-center justify-center">
          <p className="text-lg">Loading your logs...</p>
        </div>}
        
      {!loading && 
        <div className="p-6 space-y-8 min-h-screen bg-stone-100"> 

          {/* Divs for logs */}
          <div className="space-y-8">
            {Object.entries(groupedLogs).map(([type, typeLogs]) => (
              <Card key={type} className="bg-transparent border-none shadow-none">

                {/* Meidia Type Header */}
                <CardHeader className="flex flex-row justify-between items-center">
                  <h2 className="text-2xl font-bold text-stone-800 capitalize">{type}</h2>
                  <Button size="sm" variant="amber">
                    Add {type}
                  </Button>
                </CardHeader>

                <Separator className="bg-stone-300"/>

                <CardContent className="space-y-4">
                  {typeLogs.map((log) => (
                    <LogCard key={log.id} log={log} />
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Type adding button  */}
          <Button variant="outline">+ Add Media Type</Button>
        </div>
      }
    </>
  )
}
