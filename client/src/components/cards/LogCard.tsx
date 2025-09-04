import type { Log } from "@/types/media"
import { Button } from "../ui/button"

import { Fragment } from "react"

interface LogCardProps {
  log: Log
  onEdit: (log: Log) => void
  onDelete: (log: Log) => void
}

export function LogCard({log, onDelete, onEdit}: LogCardProps ) {
  return (
    <li key={log.id} className="rounded-lg border p-3 shadow-sm bg-white border-stone-200">
      {/* Header */}
      <div className="flex justify-between mb-2">
        {/* Left side: title + info */}
        <div className="flex flex-col gap-1">
          <p className="font-bold text-stone-800">{log.media.title}</p>

          <div className="flex flex-col text-xs text-stone-600 ">
            {/* Creator & year */}
            <div className="flex gap-2 items-center">
              {log.media.creator && <span>{log.media.creator}</span>}
              {log.media.creator && log.media.year && <span>•</span>}
              {log.media.year && <span>{log.media.year}</span>}
            </div>

            {/* Metadata */}
            <div className="flex gap-2 flex-wrap">
              {Object.entries(log.media.metadata || {})
                .filter(([_, value]) => value != null && value !== "")
                .map(([key, value], index, arr) => (
                  <Fragment key={key}>
                    <span className="flex gap-1 capitalize">
                      <span className="font-semibold">{key}:</span>
                      {String(value)}
                    </span>
                    {index < arr.length - 1 && <span>•</span>}
                  </Fragment>
                ))}
            </div>
          </div>
        </div>
        <div className="flex items-start gap-2">
            {(log.status || log.rating != null) && (
              
              <span className="text-xs rounded-2xl px-2 py-0.5 bg-amber-100 text-amber-800 capitalize">
                {log.status ?? ""}
                {log.status && log.rating != null ? ", " : ""}
                {log.rating != null ? `Rating: ${log.rating}` : ""}
              </span>
            )}
            {/* Logged date */}
            {log.logged_at && (
              <span className="text-xs rounded-2xl px-2 py-0.5 bg-amber-100 text-amber-800 capitalize">
                {new Date(log.logged_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
        </div>
      </div>

      <p className="text-md text-stone-800"> {log.notes} </p>

      <div className='flex justify-end gap-2'>
        {/* Edit button */}
          <Button
              size="sm" 
              variant="amber"
              onClick={() => onEdit(log)}
          >
          Edit
          </Button>

          {/* Delete Button */}
          <Button 
              size="sm" 
              variant="destructive"
              onClick={() => onDelete(log)}
          >
          Delete
          </Button>
      </div>

    </li>
  )
}
