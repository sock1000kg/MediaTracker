import type { SortDirection, SortField } from "@/types/sort"
import type { ThemePref } from "@/lib/theme"

export type StartTab = "logs" | "medias" | "mediaTypes" | "settings" | "bookSearch" | "musicSearch" | "animeSearch" | "movieSearch" | "gameSearch"

export interface SortPref {
  field: SortField
  direction: SortDirection
}

export interface Preferences {
  theme?: ThemePref
  defaultTab?: StartTab
  hideLogged?: { books?: boolean; music?: boolean; anime?: boolean; movies?: boolean; games?: boolean }
  defaultSort?: { logs?: SortPref[]; medias?: SortPref[] }
}

/** Top-level `null` removes a key; hideLogged / defaultSort merge by sub-key. */
export interface PreferencesPatch {
  theme?: ThemePref | null
  defaultTab?: StartTab | null
  hideLogged?: { books?: boolean; music?: boolean; anime?: boolean; movies?: boolean; games?: boolean }
  defaultSort?: { logs?: SortPref[]; medias?: SortPref[] }
}

export interface UserProfile {
  id: number | string
  username: string
  displayName: string
  created_at: string
  preferences: Preferences | null
}
