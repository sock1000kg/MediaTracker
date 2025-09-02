import { useState, useEffect } from "react"

import type { DialogName } from "@/types/media"
import type { Media } from "@/types/media"

import { Button } from "@/components/ui/button"

import { fetchMedias } from "@/api/media"

export default function MediasSection() {
  const [openDialog, setOpenDialog] = useState<DialogName>(null)
  const [medias, setMedias] = useState<Media[]>([])
  const [target, setTarget] = useState<Media | null>(null)

  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
      const loadMedias = async () => {
        try {
          const data = await fetchMedias()
          console.log("Fetched media types:", data)
          setMedias(data)
        } catch (error: any) {
          setErrorMessage(error.message)
        } finally {
          setLoading(false)
        }
      }
  
      loadMedias()
    }, [])


  // ACTIONS
    // Delete media type
    const handleDeleteClick = async (media: Media) => {
    }
  
    // Edit type
    const handleEditClick = async (media: Media) => {
    }
  return (
    <div className="p-4 space-y-4">

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <p className="text-lg font-semibold">Your Medias</p>
          <p className="text-sm text-gray-600">List of medias you have</p>
        </div>
        <Button size="default" variant="amber" onClick={() => setOpenDialog("mediaForm")}>
          + Add Media
        </Button>
      </div>

      {loading && <p className="text-gray-500">Loading medias...</p>}

      {/* Error message */}
      {errorMessage && (
          <p className="mt-2 text-center text-sm text-red-500">
              {errorMessage}
          </p>
      )}

      {/* Media Type list */}
      {!(medias.length > 0) && <p className=" text-gray-600">You have no medias. Create one!</p>}
      {!loading && (medias.length > 0) && (
        <ul className="space-y-2">
          {medias.map((media) => (
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
                    onClick={() => handleEditClick(media)}
                  >
                    Edit
                  </Button>

                  {/* Delete Button */}
                  <Button 
                    size="sm" 
                    variant="destructive"
                    onClick={() => handleDeleteClick(media)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
