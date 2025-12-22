import type { MusicResult } from "@/types/search"
import { Fragment } from "react/jsx-runtime"
import { Button } from "../ui/button"

interface MusicCardProps {
  book: MusicResult
  onLog?: (music: MusicResult) => void
}

export function MusicCard({ book: music, onLog }: MusicCardProps) {
  return (
    // Image
    <div className="flex gap-4 p-3 border rounded-lg bg-white shadow-sm">
        {music.imageUrl && (
            <img
            src={music.imageUrl}
            alt={music.title}
            className="object-cover rounded-md"
            />
        )}


        {/* Info */}
        <div className="flex flex-col flex-1">
            <div className="flex justify-between">
                <p className="font-semibold">{music.title}</p>

                {/* Logging button */}
                {onLog && (
                    <Button size="sm" variant="amber" onClick={() => onLog(music)}>
                    + Log
                    </Button>
                )}
            </div>

            {music.creator && <p className="text-sm text-gray-600">{music.creator}</p>}
            {music.year && <p className="text-sm text-gray-500">{music.year}</p>}

            {/* Metadata */}
            <div className="flex gap-2 flex-wrap text-xs text-stone-600">
                {Object.entries({
                    publisher: music.metadata?.publisher,
                    pageCount: music.metadata?.pageCount ? `${music.metadata.pageCount} pages` : null,
                })
                    .filter(([, value]) => value != null && value !== "") //get rid of empty fields
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

            {music.metadata?.url ? (
                <div className="flex flex-wrap gap-1 mt-1">
                    <a
                        key={music.sourceId}
                        href={music.metadata.url}
                        target="_blank" // opens in new tab
                        rel="noopener noreferrer" // security for new tab
                        className="text-xs rounded-2xl px-2 py-0.5 bg-amber-100 text-amber-800 hover:underline"
                    >
                        View on Last.fm
                    </a>
                </div>
            ) : null}

            {/* Description */}
            <p className="text-xs text-gray-500 whitespace-pre-line max-h-48 overflow-y-auto mt-2 pr-1">
                {music.description}
            </p>
        </div>
    </div>
  )
}

