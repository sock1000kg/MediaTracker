import type { Log } from "@/types/main"
import { Button } from "../ui/button"

import { Fragment } from "react"

interface LogCardProps {
  log: Log
  onEdit: (log: Log) => void
  onDelete: (log: Log) => void
}

export function LogCard({log, onDelete, onEdit}: LogCardProps ) {
  return (
    <li key={log.id} className="flex gap-4 p-3 border rounded-lg bg-white shadow-sm">
      {/* Image */}
      {log.media.imageUrl && (
        <img
          src={log.media.imageUrl}
          alt={log.media.title}
          className="w-20 h-28 object-cover rounded-md"
        />
      )}

      {/* Info */}
      <div className="flex flex-col flex-1">
        <div className="flex justify-between items-start">
          <p className="font-bold text-stone-800">{log.media.title}</p>

          {/* Status + Rating + Logged Date */}
          <div className="flex gap-2 items-end">
            {(log.status || log.rating != null) && (
              <span className="text-xs rounded-2xl px-2 py-0.5 bg-amber-100 text-amber-800 capitalize">
                {log.status ?? ""}
                {log.status && log.rating != null ? ", " : ""}
                {log.rating != null ? `Rating: ${log.rating}` : ""}
              </span>
            )}

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

        {/* Creator & Year */}
        <div className="text-sm text-stone-600">
          {log.media.creator && <span>{log.media.creator}</span>}
          {log.media.creator && log.media.year && <span> • </span>}
          {log.media.year && <span>{log.media.year}</span>}
        </div>

        {/* Metadata */}
        <div className="flex gap-2 flex-wrap text-xs text-stone-600 mt-1">
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

        {/* Notes */}
        {log.notes && (
          <p className="text-stone-700 whitespace-pre-line break-all max-h-32  overflow-y-auto mt-2 pr-1">
            {log.notes}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end mt-auto">
          <Button size="sm" variant="amber" onClick={() => onEdit(log)}>
            Edit
          </Button>
          <Button size="sm" variant="destructive" onClick={() => onDelete(log)}>
            Delete
          </Button>
        </div>
      </div>
    

    </li>
  )
}
