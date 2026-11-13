import { useLogsBackdrop } from "@/hooks/useLogsBackdrop"
import { backdropRects, resolveBackdropUrl } from "@/lib/logsBackdrop"
import { PLACEMENTS, placementStyle, type BackdropPage } from "@/lib/backdropPlacements"

// Optional: drop client/src/assets/backdrop-<page>.(jpg|png|webp) (logs: logs-backdrop.*) to use your own photo
// on that page. Resolved at build time.
const userImages = import.meta.glob("../../assets/*backdrop*.*", { eager: true, query: "?url", import: "default" }) as Record<string, unknown>

const RECTS = backdropRects()

/**
 * Decorative, still, faint. Sits behind the page content; the parent must be `relative overflow-hidden`
 * and, unless its content is positioned, `isolate` so the content paints above this layer.
 */
export function PageBackdrop({ page }: { page: BackdropPage }) {
  const on = useLogsBackdrop()
  if (!on) return null
  const image = resolveBackdropUrl(userImages, page)

  return (
    <div aria-hidden="true" data-logs-backdrop data-backdrop-page={page} className="logs-backdrop pointer-events-none absolute inset-0 -z-10 overflow-hidden print:hidden">
      {image ? (
        <div
          className="absolute inset-0 bg-cover bg-center opacity-[0.07] dark:opacity-[0.10]"
          style={{ backgroundImage: `url(${image})`, filter: "grayscale(30%)" }}
        />
      ) : (
        <svg
          viewBox="0 0 16 16"
          shapeRendering="crispEdges"
          className="absolute max-w-none opacity-[0.07] dark:opacity-[0.10]"
          style={{ ...placementStyle(PLACEMENTS[page]), imageRendering: "pixelated" }}
        >
          {RECTS.map((r, i) => (
            <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} />
          ))}
        </svg>
      )}
    </div>
  )
}
