import type { Media } from "@/types/media"

import { Button } from "../ui/button"

interface MediaCardProps {
  media: Media
  onEdit: (media: Media) => void
  onDelete: (media: Media) => void
}

export function MediaCard({ media, onEdit, onDelete}: MediaCardProps) {
  return (
    <li key={media.id} className="p-3 bg-white rounded-xl shadow-sm border border-stone-200">
        <div className="flex justify-between items-center">
            {/* Left side info */}
            <div className="flex items-center gap-1">
                <p className="font-medium">{media.title}</p>
                {media.userId == 0 && <p className="text-xs">(system)</p>}
            </div>

            {/* Right side info */}
            <div className="flex items-center gap-4">
                {/* Creation date display */}
                <span className="text-xs rounded-2xl px-2 py-0.5 bg-amber-100 text-amber-800 capitalize">
                {new Date(media.created_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                })}
                </span>
                
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
        </div>
    </li>
  )
}
