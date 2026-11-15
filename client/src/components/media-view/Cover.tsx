import { coverToken, type CoverAspect } from "@/lib/mediaView"
import { cn } from "@/lib/utils"

const ROW_SIZE = {
  portrait: "w-16 h-24 sm:w-20 sm:h-30",
  square: "w-20 h-20 sm:w-24 sm:h-24",
  wide: "w-28 h-[70px] sm:w-32 sm:h-20",
} as const

const TILE_ASPECT = {
  portrait: "aspect-[2/3]",
  square: "aspect-square",
  wide: "aspect-[16/10]",
} as const

interface CoverProps {
  id: number | string
  title: string
  imageUrl?: string | null
  aspect: CoverAspect
  size: "row" | "tile"
}

export function Cover({ id, title, imageUrl, aspect, size }: CoverProps) {
  const dims = size === "row" ? cn("flex-none", ROW_SIZE[aspect]) : cn("w-full", TILE_ASPECT[aspect])
  const base = cn("rounded-md ring-1 ring-border", dims)

  if (imageUrl) {
    return <img src={imageUrl} loading="lazy" alt="" className={cn(base, "object-cover")} />
  }

  const letter = (title ?? "").trim().charAt(0).toUpperCase()
  return (
    <div
      aria-hidden="true"
      className={cn(base, "flex items-center justify-center font-display font-semibold select-none", size === "row" ? "text-2xl" : "text-5xl")}
      style={{ background: `var(--cover-${coverToken(id)})`, color: "var(--cover-ink)" }}
    >
      {letter}
    </div>
  )
}
