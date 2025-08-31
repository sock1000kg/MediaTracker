import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import MediaTypeForm from "@/components/forms/MediaTypeForm"

import { fetchMediaTypes } from "@/api/mediaType"

import type { MediaType, DialogName } from "@/types/media"

export default function MediaTypesSection() {
  const [openDialog, setOpenDialog] = useState<DialogName>(null)
  const [mediaTypes, setMediaTypes] = useState<MediaType[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Fetch for media types
  useEffect(() => {
    const loadMediaTypes = async () => {
      try {
        const data = await fetchMediaTypes()
        console.log("Fetched media types:", data)
        setMediaTypes(data)
      } catch (error: any) {
        setErrorMessage(error.message)
      } finally {
        setLoading(false)
      }
    }

    loadMediaTypes()
  }, [])

  const handleCreated = (newType: MediaType) => {
    setMediaTypes(prev => [ ...prev, newType])
  }

  

  return (
    <div className="p-4 space-y-4">

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <p className="text-lg font-semibold">Your Media Types</p>
          <p className="text-sm text-gray-600">List of categories you have created</p>
        </div>
        <Button size="default" variant="amber" onClick={() => setOpenDialog("mediaTypeForm")}>
          + Add Media Type
        </Button>
      </div>

      {loading && <p className="text-gray-500">Loading media types...</p>}

      {/* Error message */}
      {errorMessage && (
          <p className="mt-2 text-center text-sm text-red-500">
              {errorMessage}
          </p>
      )}

      {/* Media Type list */}
      {!loading && !errorMessage && (
        <ul className="space-y-2">
          {mediaTypes.map((mediaType) => (
            <li 
              key={mediaType.id} 
              className="p-3 bg-white rounded-xl shadow-sm border border-stone-200"
            >
              <div className="flex justify-between items-center">
                <p className="font-medium">{mediaType.name}</p>

                <span className="text-sm rounded-2xl px-1.5 bg-amber-100 text-amber-800 capitalize">
                  {new Date(mediaType.created_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Dialog */}
          <MediaTypeForm 
            open={openDialog}
            onOpenChange={setOpenDialog}
            onCreated={handleCreated}
          />
    </div>

  )
}
