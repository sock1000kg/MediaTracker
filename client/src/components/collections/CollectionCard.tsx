import { Cover } from "@/components/media-view/Cover"
import { coverMosaic } from "@/lib/collectionHelpers"
import type { CollectionSummary } from "@/types/mainTypes"

interface CollectionCardProps {
  collection: CollectionSummary
  onSelect: (id: number) => void
}

export function CollectionCard({ collection, onSelect }: CollectionCardProps) {
  const slots = coverMosaic(collection.covers)
  const countLabel = `${collection.count} ${collection.count === 1 ? "item" : "items"}${
    collection.ranked ? " · Ranked" : ""
  }`

  return (
    <button
      type="button"
      onClick={() => onSelect(collection.id)}
      className="group flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-left shadow-xs transition-all hover:border-border-strong hover:shadow-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
      aria-label={`View collection ${collection.name}, ${countLabel}`}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-md ring-1 ring-border grid grid-cols-2 grid-rows-2 gap-0.5 bg-muted">
        {slots.map((url, i) => (
          <div key={i} className="relative h-full w-full overflow-hidden">
            {url ? (
              <img
                src={url}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <Cover
                id={`${collection.id}-${i}`}
                title={collection.name}
                aspect="square"
                size="tile"
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1 min-w-0">
        <h3 className="font-display font-semibold text-base break-words line-clamp-1 group-hover:text-link">
          {collection.name}
        </h3>
        <p className="text-xs text-muted-foreground tabular-nums">{countLabel}</p>
        {collection.description && (
          <p className="line-clamp-2 text-xs text-muted-foreground italic break-words">
            {collection.description}
          </p>
        )}
      </div>
    </button>
  )
}
