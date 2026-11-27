export type LetterState = "sealed" | "ready" | "opened"

export interface Letter {
  id: string
  logId: string
  media: { id: string; title: string; mediaType: string | null }
  created_at: string
  opensAt: string | null
  opensOnRelog: boolean
  openedAt: string | null
  state: LetterState
  /** Only present once opened: the server withholds the text until then. */
  body?: string
}

export interface LetterSummary {
  sealed: number
  ready: number
  nextOpensAt: string | null
}

export interface NewLetter {
  logId: string
  body: string
  opensAt?: string
  opensOnRelog?: boolean
  /** The writer's local date, so "tomorrow" is theirs. */
  today?: string
}
