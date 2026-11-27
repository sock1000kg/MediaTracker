// Drawn like the dude: a pixel grid at an integer scale (DESIGN §4).
// `A` outline, `P` paper, `W` wax.
const ENVELOPE_GRID = [
  "AAAAAAAAAAA",
  "AAPPPPPPPAA",
  "APAPPPPPAPA",
  "APPAWWWAPPA",
  "APPPWWWPPPA",
  "APPPPWPPPPA",
  "APPPPPPPPPA",
  "AAAAAAAAAAA",
]

const FILL: Record<string, string> = { A: "#000", P: "#efe6d6", W: "var(--wax)" }

export function PixelEnvelope({ scale = 2, className }: { scale?: number; className?: string }) {
  const width = ENVELOPE_GRID[0].length
  const height = ENVELOPE_GRID.length
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width * scale} height={height * scale} shapeRendering="crispEdges" aria-hidden="true" data-testid="dude-envelope" className={className}>
      {ENVELOPE_GRID.flatMap((row, y) =>
        row.split("").map((c, x) => <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={FILL[c]} />)
      )}
    </svg>
  )
}
