import { useState, useEffect } from "react"

import type { DialogName } from "@/types/media"
import type { Media } from "@/types/media"

import { Button } from "@/components/ui/button"
import { MediaTypeCard } from "@/components/cards/MediaTypeGroupCard"
import { MediaCard } from "@/components/cards/MediaCard"

import { fetchMedias } from "@/api/media"

export default function MediasSection() {
  const [openDialog, setOpenDialog] = useState<DialogName>(null)
  const [medias, setMedias] = useState<Media[]>([])
  const [target, setTarget] = useState<Media | null>(null)

  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Group Medias by type
  const groupedMedias = medias.reduce((acc, media) => {
      const type = media.mediaType.name
  
      if (!acc[type]) acc[type] = [] //Create empty type array if type doesnt exist
      acc[type].push(media)
  
      return acc
    }, {} as Record<string, Media[]>) //<key,value> object

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
      {!(medias.length > 0) && !loading && <p className=" text-gray-600">You have no medias. Create one!</p>}
      {!loading && (medias.length > 0) && (
        <ul className="space-y-2">
          {Object.entries(groupedMedias).map(([type, typeMedias]) => (
            <MediaTypeCard key={type} type={type}>
              {typeMedias.map((media) => (
                <MediaCard
                  key={media.id}
                  media={media}
                  onEdit={handleEditClick}
                  onDelete={handleDeleteClick}
                />
              ))}
            </MediaTypeCard>
          ))}
        </ul>
      )}
    </div>
  )
}
