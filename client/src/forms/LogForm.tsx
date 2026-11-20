import { useEffect } from "react"
import type { Log, Media } from "@/types/mainTypes"
import { LogFormBody } from "./LogFormBody"

interface LogFormProps {
  formData: Partial<Log>
  setFormData: React.Dispatch<React.SetStateAction<Partial<Log>>>
  targetMedia: Media // for create mode, in edit mode the target's info is passed from EntityDialog
  /** Edit mode: open the entry editor on a new entry straight away. */
  startAdding?: boolean
}

export function LogForm({ formData, setFormData, targetMedia, startAdding }: LogFormProps) {
  useEffect(() => { //edit mode's prefilling is handled in EntityDialog
    if (targetMedia && !formData.id && !formData.media) {
      // create mode: set the media to logForm
      setFormData((prev) => ({ ...prev, media: targetMedia }))
    }
  }, [targetMedia, formData.id, formData.media, setFormData])

  return (
    <LogFormBody
      formData={formData}
      setFormData={setFormData}
      media={targetMedia}
      idPrefix="log"
      startAdding={startAdding}
    />
  )
}
