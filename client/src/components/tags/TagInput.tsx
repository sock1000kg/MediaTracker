import { useState, useRef, useEffect, useId } from "react"
import { useQuery } from "@tanstack/react-query"
import { X } from "lucide-react"
import { fetchTags } from "@/api/tags"
import {
  normalizeTagName,
  tagKey,
  MAX_TAGS_PER_LOG,
  MAX_TAG_LENGTH,
} from "@/lib/tagHelpers"

interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  disabled?: boolean
  maxTags?: number
  id?: string
}

export function TagInput({
  value = [],
  onChange,
  disabled = false,
  maxTags = MAX_TAGS_PER_LOG,
  id: propId,
}: TagInputProps) {
  const autoId = useId()
  const inputId = propId || autoId
  const listboxId = `${inputId}-listbox`

  const [input, setInput] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [error, setError] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data: allTags = [] } = useQuery({
    queryKey: ["tags"],
    queryFn: fetchTags,
  })

  // Current tag keys in log
  const selectedKeys = new Set(value.map(tagKey))

  // Filtered suggestions matching typed text
  const trimmed = input.trim()
  const cleanInput = trimmed.replace(/^#+/, "").trim()
  const cleanKey = cleanInput.toLowerCase()

  const matchingTags = allTags.filter((t) => {
    if (selectedKeys.has(tagKey(t.name))) return false
    if (!cleanKey) return true
    return t.name.toLowerCase().includes(cleanKey)
  })

  const exactMatchExists = allTags.some(
    (t) => tagKey(t.name) === cleanKey
  ) || selectedKeys.has(cleanKey)

  // Items in listbox: matching suggestions, plus "Create “x”" if typed text has no exact match
  type SuggestionItem = { type: "existing"; name: string } | { type: "create"; name: string }

  const suggestions: SuggestionItem[] = [
    ...matchingTags.map((t) => ({ type: "existing" as const, name: t.name })),
    ...(cleanInput && !exactMatchExists
      ? [{ type: "create" as const, name: cleanInput }]
      : []),
  ]

  // Close dropdown on outside click
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setHighlightedIndex(-1)
      }
    }
    document.addEventListener("mousedown", handlePointerDown)
    return () => document.removeEventListener("mousedown", handlePointerDown)
  }, [])

  const commitTag = (rawName: string) => {
    const norm = normalizeTagName(rawName)
    if (!norm) {
      if (rawName.includes(",")) {
        setError("Tags cannot contain commas")
      } else if (rawName.length > MAX_TAG_LENGTH) {
        setError(`Tag cannot exceed ${MAX_TAG_LENGTH} characters`)
      } else {
        setError("Tag must be 1–40 characters without commas")
      }
      return
    }

    const key = tagKey(norm)
    if (selectedKeys.has(key)) {
      setError(`Tag “#${norm}” already added`)
      setInput("")
      return
    }

    if (value.length >= maxTags) {
      setError(`A log can have at most ${maxTags} tags`)
      return
    }

    setError(null)
    onChange([...value, norm])
    setInput("")
    setIsOpen(false)
    setHighlightedIndex(-1)
  }

  const removeTag = (nameToRemove: string) => {
    const keyToRemove = tagKey(nameToRemove)
    setError(null)
    onChange(value.filter((t) => tagKey(t) !== keyToRemove))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (!isOpen && suggestions.length > 0) {
        setIsOpen(true)
        setHighlightedIndex(0)
      } else if (suggestions.length > 0) {
        setHighlightedIndex((prev) => (prev + 1) % suggestions.length)
      }
      return
    }

    if (e.key === "ArrowUp") {
      e.preventDefault()
      if (isOpen && suggestions.length > 0) {
        setHighlightedIndex((prev) =>
          prev <= 0 ? suggestions.length - 1 : prev - 1
        )
      }
      return
    }

    if (e.key === "Escape") {
      if (isOpen) {
        e.preventDefault()
        setIsOpen(false)
        setHighlightedIndex(-1)
      }
      return
    }

    if (e.key === "Enter") {
      e.preventDefault()
      if (isOpen && highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        commitTag(suggestions[highlightedIndex].name)
      } else if (input.trim()) {
        commitTag(input)
      }
      return
    }

    if (e.key === "," || (e.key === "Tab" && input.trim())) {
      if (input.trim()) {
        e.preventDefault()
        if (isOpen && highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          commitTag(suggestions[highlightedIndex].name)
        } else {
          commitTag(input)
        }
      }
      return
    }

    if (e.key === "Backspace" && !input && value.length > 0) {
      e.preventDefault()
      removeTag(value[value.length - 1])
    }
  }

  const activeDescendantId =
    isOpen && highlightedIndex >= 0 && highlightedIndex < suggestions.length
      ? `${inputId}-option-${highlightedIndex}`
      : undefined

  return (
    <div ref={containerRef} className="relative w-full space-y-1">
      <div
        className={`flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-card px-2.5 py-1.5 text-sm focus-within:ring-2 focus-within:ring-ring ${
          disabled ? "opacity-60 cursor-not-allowed" : ""
        }`}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="user-tag inline-flex items-center gap-1 cursor-default text-xs"
          >
            <span>#{tag}</span>
            <button
              type="button"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation()
                removeTag(tag)
              }}
              aria-label={`Remove tag ${tag}`}
              className="inline-flex items-center justify-center rounded-full p-0.5 text-muted-foreground hover:text-foreground focus:outline-none"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={input}
          disabled={disabled || value.length >= maxTags}
          placeholder={value.length >= maxTags ? "Max tags reached" : (value.length === 0 ? "Add tags (e.g. sci-fi, favorite)…" : "Add tag…")}
          role="combobox"
          aria-expanded={isOpen && suggestions.length > 0}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={activeDescendantId}
          aria-invalid={!!error}
          className="min-w-[120px] flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          onChange={(e) => {
            setInput(e.target.value)
            setError(null)
            setIsOpen(true)
            setHighlightedIndex(-1)
          }}
          onFocus={() => {
            if (suggestions.length > 0) {
              setIsOpen(true)
            }
          }}
          onKeyDown={handleKeyDown}
        />
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      {isOpen && suggestions.length > 0 && !disabled && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Tag suggestions"
          className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-card p-1 shadow-md"
        >
          {suggestions.map((item, index) => {
            const isHighlighted = index === highlightedIndex
            return (
              <li
                key={`${item.type}-${item.name}`}
                id={`${inputId}-option-${index}`}
                role="option"
                aria-selected={isHighlighted}
                onMouseDown={(e) => {
                  e.preventDefault() // prevent blur
                  commitTag(item.name)
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`flex cursor-pointer items-center justify-between rounded px-3 py-1.5 text-sm ${
                  isHighlighted ? "bg-muted text-foreground" : "text-foreground"
                }`}
              >
                <span>
                  {item.type === "create" ? (
                    <span>
                      Create <span className="font-semibold">“#{item.name}”</span>
                    </span>
                  ) : (
                    <span>#{item.name}</span>
                  )}
                </span>
                {item.type === "existing" && (
                  <span className="text-xs text-muted-foreground">existing</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
