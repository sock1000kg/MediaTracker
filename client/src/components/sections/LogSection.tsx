import { Button } from "@/components/ui/button"
import { LogCard } from "@/components/cards/LogCard"
import { MediaTypeCard } from "@/components/cards/MediaTypeCard"
import type { Log } from "@/types/media"

interface LogSectionProps {
  groupedLogs: Record<string, Log[]>
}

export default function LogsSection({ groupedLogs }: LogSectionProps) {
  return (
    <div className="space-y-8">
      {Object.entries(groupedLogs).map(([type, typeLogs]) => (
        <MediaTypeCard key={type} type={type}>
          {typeLogs.map((log) => (
            <LogCard key={log.id} log={log} />
          ))}
        </MediaTypeCard>
      ))}

      <Button variant="outline">+ Add Log</Button>
    </div>
  )
}
