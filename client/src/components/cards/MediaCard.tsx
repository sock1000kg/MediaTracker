import {Fragment} from 'react'

import type { Media } from "@/types/media"

import { Button } from "../ui/button"

interface MediaCardProps {
  media: Media
  onEdit: (media: Media) => void
  onDelete: (media: Media) => void
  onLog: (media: Media) => void
}

export function MediaCard({ media, onEdit, onDelete, onLog}: MediaCardProps) {
  return (
    <li key={media.id} className="p-3 bg-white rounded-xl shadow-sm border border-stone-200">
        {/* Header */}
        <div className="flex justify-between mb-2">
            {/* Left side title */}
            <div className="flex-col items-center gap-1">
                <div>
                    <p className="font-bold text-stone-800">{media.title}</p>
                    {media.userId == 0 && <p className="text-xs">(System)</p>}
                </div>

                {/* Info */}
                <div className="flex-col text-xs text-stone-600 gap-2">
                    <div className="flex gap-2 items-center capitalize">
                        {media.creator && <span>{media.creator}</span>}
                        {media.creator && media.year && <span>•</span>}
                        {media.year && <span>{media.year}</span>}
                    </div>
                    {/* Metadata */}
                    <div className=" flex gap-2">
                        {Object.entries(media.metadata || {}) //converts to array of [key (metadataName), value] pairs
                            .filter(([value]) => value != null && value !== '') // Filter out empty values
                            .map(([key, value], index, arr) => (
                                <Fragment key={key}>
                                    <span className='flex gap-1 capitalize'>
                                        <span className="font-semibold">
                                            {key}:
                                        </span>
                                        {String(value)}
                                    </span>
                                    {index < arr.length - 1 && <span>•</span>}
                                </Fragment>
                            ))
                        }
                    </div>
                </div>
            </div>

            {/* Right side title */}
            <div className="flex items-start gap-4">
                {/* Creation date display */}
                <span className="text-xs rounded-2xl px-2 py-0.5 bg-amber-100 text-amber-800 capitalize">
                {new Date(media.created_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                })}
                </span>
            </div>
        </div>

        {/* Buttons */}
        <div className='flex justify-end gap-2'>
            {/* Log Button */}
            <Button
                size="sm"
                variant="amber"
                onClick={() => {
                    onLog(media)
                }}
            >
            Log
            </Button>

            {/* Edit button */}
            <Button
                size="sm" 
                variant="amber"
                onClick={() => onEdit(media)}
            >
            Edit
            </Button>

            {/* Delete Button */}
            <Button 
                size="sm" 
                variant="destructive"
                onClick={() => onDelete(media)}
            >
            Delete
            </Button>
        </div>
    </li>
  )
}

