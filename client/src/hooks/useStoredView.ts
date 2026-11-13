import { useState } from "react"
import { readStoredString, writeStoredString } from "@/lib/utils"
import type { View } from "@/components/media-view/ViewControls"

const VIEWS = ["list", "grid"] as const

/** List/Grid choice remembered in localStorage under `key` (default List; never throws). */
export function useStoredView(key: string): [View, (v: View) => void] {
  const [view, setViewState] = useState<View>(() => readStoredString(key, VIEWS, "list"))
  const setView = (v: View) => { setViewState(v); writeStoredString(key, v) }
  return [view, setView]
}
