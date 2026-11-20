import type { Log } from "@/types/mainTypes"
import type { MediaResult } from "@/types/search"
import { LogFormBody } from "./LogFormBody"

interface MediaSearchLogFormProps {
  formData: Partial<Log>
  setFormData: React.Dispatch<React.SetStateAction<Partial<Log>>>
  targetMedia: MediaResult // for create mode, in edit mode the target's info is passed from EntityDialog
  /** Edit mode: open the entry editor on a new entry straight away. */
  startAdding?: boolean
}

/** The log form for a search result: the same body, fed from the result instead of a saved media row. */
export function MediaSearchLogForm({ formData, setFormData, targetMedia, startAdding }: MediaSearchLogFormProps) {
  return (
    <LogFormBody
      formData={formData}
      setFormData={setFormData}
      media={{
        id: formData.media?.id ?? targetMedia.sourceId,
        title: targetMedia.title,
        imageUrl: targetMedia.imageUrl,
        mediaType: targetMedia.mediaType,
        subtype: targetMedia.subtype,
        details: targetMedia.details as Record<string, unknown> | null | undefined,
      }}
      idPrefix="search-log"
      startAdding={startAdding}
    />
  )
}
