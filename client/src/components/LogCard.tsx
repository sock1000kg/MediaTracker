import type { Log } from "@/types/media"

export function LogCard({ log }: { log: Log }) {
  return (
    <div>
      <div className="rounded-lg border p-3 shadow-sm bg-white border-stone-200">
        <div className="flex justify-between items-center">
          <span className="font-bold text-stone-800">{log.media.title}</span>
          <span className="text-sm rounded-2xl px-1.5 bg-amber-100 text-amber-800 capitalize">
            {log.status}, Rating: {log.rating}
          </span>
        </div>
        <div className="text-md text-stone-800"> {log.notes} </div>
      </div>
    </div>
  )
}
