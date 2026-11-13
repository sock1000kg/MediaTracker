// Copy and small helpers for the whimsy layer (client/DESIGN.md §5).

export const LOADING_LINES = [
  "lotta dust on these shelves…",
  "pray that the api have whatever niche you're into…",
  "flipping through…",
  "laoding…",
  "what's next…",
  "job application…",
  "loading…",
  "yikes forever…",
  "yanking…",
] as const

/** Pick one loading line. `rand` is in [0, 1). */
export function pickLoadingLine(rand: number = Math.random()): string {
  return LOADING_LINES[Math.min(LOADING_LINES.length - 1, Math.floor(rand * LOADING_LINES.length))]
}

export const EMPTY_LINES = {
  noLogs: "nothing logged yet. go find something good.",
  noMatch: "nothing matches. i looked under your bed too.",
  noMedias: "no media of your own yet. the shelf is very clean.",
  noResults: "couldn't find that one. too niche?",
  allHidden: "you've logged all of these. impressive, honestly.",
  noTypes: "no types yet. books? records? rocks?",
} as const
