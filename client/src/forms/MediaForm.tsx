import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { useState, useEffect } from "react"

import { fetchMediaTypes } from "@/api/mediaType"

import type { Media, MediaType } from "@/types/media"


const AVAILABLE_METADATA_FIELDS = ["duration", "edition", "genre", "language", "pages", "platform",]

interface CreateMediaFormProps {
    formData: Partial<Media>,
    setFormData: React.Dispatch<React.SetStateAction<Partial<Media>>> //state setter for formData
}

export function CreateMediaForm({
    formData,
    setFormData
}: CreateMediaFormProps) {
    const [selectedMetadata, setSelectedMetadata] = useState<string>("")
    const [mediaTypes, setMediaTypes] = useState<MediaType[]>([])

    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    useEffect(() => {
        const loadMediaTypes = async () => {
            try {
                const data = await fetchMediaTypes()
                console.log("Fetched media types:", data)
                setMediaTypes(data)
            } catch (error: any) {
                setErrorMessage(error.message)
            }
        }

        loadMediaTypes()
    }, [])

    const addMetadataField = () => {
        if (!selectedMetadata) return
        setFormData(prev => ({
            ...prev,
            metadata: {
                ...(prev.metadata ?? {}),
                [selectedMetadata]: ""
            }
        }))
    setSelectedMetadata("") // reset dropdown
    }

    const updateMetadataValue = (key: string, value: string) => {
        setFormData(prev => ({
            ...prev,
            metadata: {
                ...(prev.metadata ?? {}),
                [key]: value
            }
        }))
    }

    const removeMetadataField = (key: string) => {
        setFormData(prev => {
            const newMetadata = { ...(prev.metadata ?? {}) }
            delete newMetadata[key]
            return { ...prev, metadata: newMetadata }
        })
    }

    return (
        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 p-2">
            {/* Error message */}
            {errorMessage && (
                <p className="mt-2 text-center text-sm text-red-500">
                    {errorMessage}
                </p>
            )}

            {/* Title */}
            <label className="block">
                <span className="text-sm">Title*</span>
                <input
                    type="text"
                    value={formData.title ?? ""}
                    onChange={(e) =>
                    setFormData((prev) => ({ ...prev, title: e.target.value }))
                    }
                    className="mt-1 block w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm focus:ring-2 focus:outline-none focus:ring-amber-300"
                    placeholder="e.g. The Lord of the Rings"
                />
            </label>

            {/* Media Type (dropdown) */}
            <label className="block">
                <span className="text-sm">Media Type*</span>
                <Select value={formData.mediaType?.id?.toString()} onValueChange={(val) => {
                    const selectedType = mediaTypes.find(mediaType => mediaType.id === Number(val))
                        setFormData(prev => ({ ...prev, mediaType: selectedType }))
                    }}>

                    <SelectTrigger className="mt-1 flex w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm focus:ring-2 focus:outline-none focus:ring-amber-300">
                        <SelectValue placeholder="Select a type" />
                    </SelectTrigger>

                    <SelectContent>
                        {mediaTypes.map(mediaType => (
                        <SelectItem key={mediaType.id} value={mediaType.id.toString()}>
                            {mediaType.name}
                        </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </label>

            {/* Creator */}
            <label className="block">
                <span className="text-sm">Creator</span>
                <input
                    type="text"
                    value={formData.creator ?? ""}
                    onChange={(e) =>
                        setFormData((prev) => ({ ...prev, creator: e.target.value }))
                    }
                    className="mt-1 block w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm focus:ring-2 focus:outline-none focus:ring-amber-300"
                    placeholder="e.g. J.R.R. Tolkien"
                />
            </label>

            {/* Year */}
            <label className="block">
                <span className="text-sm">Year</span>
                <input
                    type="number"
                    value={formData.year ?? ""}
                    onChange={(e) =>
                    setFormData((prev) => ({
                        ...prev,
                        year: e.target.value ? Number(e.target.value) : undefined,
                    }))
                    }
                    className="mt-1 block w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm focus:ring-2 focus:outline-none focus:ring-amber-300"
                    placeholder="e.g. 1954"
                />
            </label>

            {/* Metadata */}
            <div>
                <span className="text-sm">Metadata</span>

                {/* Dropdown */}
                <div className="flex gap-2 mt-1">
                    <Select
                    value={selectedMetadata}
                    onValueChange={(val) => setSelectedMetadata(val)}
                    >
                    <SelectTrigger
                        className="w-[280px] rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm focus:ring-2 focus:outline-none focus:ring-amber-300"
                    >
                        <SelectValue placeholder="Select metadata field" />
                    </SelectTrigger>

                    <SelectContent className="rounded-md border border-gray-200 bg-white shadow-md">
                        {AVAILABLE_METADATA_FIELDS.map((field) => (
                        <SelectItem
                            key={field}
                            value={field}
                            className="cursor-pointer text-sm hover:bg-gray-100 focus:bg-gray-100"
                        >
                            {field}
                        </SelectItem>
                        ))}
                    </SelectContent>
                    </Select>

                    <button
                    type="button"
                    onClick={addMetadataField}
                    className="px-3 py-2 rounded-md bg-stone-500 text-sm text-white hover:bg-stone-600"
                    >
                    Add
                    </button>
                </div>

                {/* Render added metadata fields */}
                <div className="mt-3 space-y-2">
                    {formData.metadata &&
                    Object.entries(formData.metadata).map(([key, value]) => (
                        <div key={key} className="flex items-center gap-2">
                        <span className="w-24 text-sm">{key}</span>
                        <input
                            type="text"
                            value={value as string}
                            onChange={(e) => updateMetadataValue(key, e.target.value)}
                            className="flex-1 rounded-md border border-gray-300 bg-gray-50 px-2 py-1 text-sm focus:ring-2 focus:ring-amber-300"
                            placeholder={`Enter ${key}`}
                        />
                        <button
                            type="button"
                            onClick={() => removeMetadataField(key)}
                            className="px-2 py-1 rounded-md bg-red-400 text-white text-xs hover:bg-red-500"
                        >
                            ✕
                        </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}