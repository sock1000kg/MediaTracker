import type { Log } from "@/types/media"

interface LogCardProps {
  log: Log
}

export function LogCard({log}: LogCardProps ) {
  return (
    <li>
      <div className="rounded-lg border p-3 shadow-sm bg-white border-stone-200">

        <div className="flex justify-between items-center">
          <p className="font-bold text-stone-800">{log.media.title}</p>
          <span className="text-sm rounded-2xl px-2 py-0.5 bg-amber-100 text-amber-800 capitalize">
            {log.status}, Rating: {log.rating}
          </span>
        </div>

        <p className="text-md text-stone-800"> {log.notes} </p>
        
      </div>
    </li>
  )
}
