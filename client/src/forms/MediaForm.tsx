import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { useState, useEffect } from "react"

import { fetchMediaTypes } from "@/api/mediaType"

import type { Media, MediaType } from "@/types/mainTypes"

const AVAILABLE_DETAILS_FIELDS = ["duration", "edition", "categories", "language", "pageCount", "url"]

interface MediaFormProps {
    formData: Partial<Media>,
    setFormData: React.Dispatch<React.SetStateAction<Partial<Media>>> //state setter for formData
}

export function MediaForm({
    formData,
    setFormData
}: MediaFormProps) {
    const [selectedDetails, setSelectedDetails] = useState<string>("")
    const [mediaTypes, setMediaTypes] = useState<MediaType[]>([])

    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    useEffect(() => {
        const loadMediaTypes = async () => {
            try {
                const data = await fetchMediaTypes()
                setMediaTypes(data)
            } catch (error: unknown) {
                const msg = error instanceof Error ? error.message : "Failed to load MediaTypes"
                setErrorMessage(msg)
            }
        }

        loadMediaTypes()
    }, [])

    useEffect(() => {
        if (formData.genres && formData.genres.length > 0 && formData.details?.categories === undefined) {
            setFormData(prev => ({
                ...prev,
                details: {
                    ...(prev.details ?? {}),
                    categories: formData.genres!.join(", "),
                }
            }))
        }
    }, [formData.genres, formData.details?.categories, setFormData])

    const addDetailsField = () => {
        if (!selectedDetails) return
        setFormData(prev => ({
            ...prev,
            details: {
                ...(prev.details ?? {}),
                [selectedDetails]: ""
            }
        }))
        setSelectedDetails("") // reset dropdown
    }

    const updateDetailsValue = (key: string, value: string) => {
        setFormData(prev => ({
            ...prev,
            details: {
                ...(prev.details ?? {}),
                [key]: value
            }
        }))
    }

    const removeDetailsField = (key: string) => {
        setFormData(prev => {
            const newDetails = { ...(prev.details ?? {}) }
            delete newDetails[key]
            // Clearing genres too stops the seeding effect above from re-adding "categories".
            return key === "categories"
                ? { ...prev, details: newDetails, genres: [] }
                : { ...prev, details: newDetails }
        })
    }

    return (
        <div className="space-y-4 max-h-[520px] overflow-y-auto pr-2 p-2">
            {/* Error message */}
            {errorMessage && (
                <p className="mt-2 text-center text-sm text-destructive">
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
                    className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:ring-2 focus:outline-none "
                    placeholder="e.g. The Lord of the Rings"
                />
            </label>

            {/* Media Type (dropdown) */}
            <label className="block">
                <span className="text-sm">Media Type*</span>
                <Select value={formData.mediaType?.id ?? ""} onValueChange={(val) => {
                        const selectedType = mediaTypes.find(
                            mediaType => mediaType.id === val
                        )
                        setFormData(prev => ({ ...prev, mediaType: selectedType }))
                    }}>

                    <SelectTrigger className="mt-1 flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:ring-2 focus:outline-none ">
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
                    className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:ring-2 focus:outline-none "
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
                    className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:ring-2 focus:outline-none "
                    placeholder="e.g. 1954"
                />
            </label>

            {/* Image Url */}
            <label className="block">
                <span className="text-sm mr-1">Image URL</span>
                <input
                    type="text"
                    value={formData.imageUrl ?? ""}
                    onChange={(e) =>
                        setFormData((prev) => ({ ...prev, imageUrl: e.target.value }))
                    }
                    className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:ring-2 focus:outline-none "
                    placeholder="Only allow https:// links"
                />
            </label>

            {/* Description */}
            <label className="block">
                <span className="text-sm">Description</span>
                <textarea
                    value={formData.description ?? ""}
                    onChange={(e) =>
                        setFormData((prev) => ({ ...prev, description: e.target.value }))
                    }
                    className="mt-1 block w-full h-40 rounded-md border border-input bg-card px-3 py-2 text-sm focus:ring-2 focus:outline-none "
                    placeholder="Descibe this media"
                    />
            </label>

            {/* Details */}
            <div>
                <span className="text-sm">Details</span>

                {/* Dropdown */}
                <div className="flex gap-2 mt-1">
                    <Select
                    value={selectedDetails}
                    onValueChange={(val) => setSelectedDetails(val)}
                    >
                    <SelectTrigger
                        className="w-[280px] flex rounded-md border border-input bg-card px-3 py-2 text-sm focus:ring-2 focus:outline-none "
                    >
                        <SelectValue placeholder="Select details field" />
                    </SelectTrigger>

                    <SelectContent className="rounded-md border border-border bg-card shadow-md">
                        {AVAILABLE_DETAILS_FIELDS.map((field) => (
                        <SelectItem
                            key={field}
                            value={field}
                            className="cursor-pointer text-sm hover:bg-muted focus:bg-muted"
                        >
                            {field}
                        </SelectItem>
                        ))}
                    </SelectContent>
                    </Select>

                    <button
                    type="button"
                    onClick={addDetailsField}
                    className="px-3 py-2 rounded-md bg-secondary text-sm text-secondary-foreground hover:bg-muted border border-border-strong focus:ring-2 focus:outline-none"
                    >
                    Add
                    </button>
                </div>

                {/* Render added details fields */}
                <div className="mt-3 space-y-2">
                    {formData.details &&
                    Object.entries(formData.details).map(([key, value]) => (
                        <div key={key} className="flex items-center gap-2">
                        <span className="w-24 text-sm">{key}</span>
                        <input
                            type="text"
                            value={value as string}
                            onChange={(e) => updateDetailsValue(key, e.target.value)}
                            className="flex-1 rounded-md border border-input bg-card px-2 py-1 text-sm focus:ring-2 "
                            placeholder={`Enter ${key}`}
                        />
                        <button
                            type="button"
                            onClick={() => removeDetailsField(key)}
                            aria-label={`Remove ${key}`}
                            className="px-2 py-1 rounded-md bg-destructive text-primary-foreground text-xs hover:bg-destructive/90"
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
