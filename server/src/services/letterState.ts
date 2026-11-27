/** The one place that decides whether a letter is sealed, ready or opened. Nothing of this is stored. */
export type LetterState = "sealed" | "ready" | "opened"

export type LetterStateInput = {
    created_at: Date
    opensAt: Date | null
    opensOnRelog: boolean
    openedAt: Date | null
}

export function letterState(letter: LetterStateInput, latestEntryCreatedAt: Date | null, now = new Date()): LetterState {
    if (letter.openedAt) return "opened"
    if (letter.opensAt && letter.opensAt.getTime() <= now.getTime()) return "ready"
    // Only an entry added after sealing counts as logging it again
    if (letter.opensOnRelog && latestEntryCreatedAt && latestEntryCreatedAt.getTime() > letter.created_at.getTime()) return "ready"
    return "sealed"
}
