import { useReducedMotion } from "@/hooks/useReducedMotion"
import { useLayoutEffect, useRef, useState } from "react"
import { initialCount, step, visibleSlice, type RevealView } from "@/lib/logView"

/**
 * Per-group "Load more…" state. Counts live per group key and reset when `resetKey`
 * (filters, search, sorts), the view or the group mode change; edits and deletes leave them alone.
 * After a reveal, focus moves to the first newly shown item of that group's list.
 * Collapse returns one group to its initial count, scrolls to its heading and focuses it.
 */
export function useGroupReveal(view: RevealView, mode: string, resetKey: string) {
  const scope = `${view}|${mode}|${resetKey}`
  const [state, setState] = useState<{ scope: string; counts: Record<string, number> }>({ scope, counts: {} })
  const counts = state.scope === scope ? state.counts : {}
  const lists = useRef(new Map<string, HTMLElement | null>())
  const headings = useRef(new Map<string, HTMLElement | null>())
  const pending = useRef<{ key: string; index: number } | { key: string; collapse: true } | null>(null)
  const reduced = useReducedMotion()

  const shownFor = (key: string) => counts[key] ?? initialCount(view, mode)
  const slice = <T,>(key: string, items: T[]) => visibleSlice(items, shownFor(key))
  const listRef = (key: string) => (el: HTMLElement | null) => { lists.current.set(key, el) }

  const headingRef = (key: string) => (el: HTMLElement | null) => { headings.current.set(key, el) }
  const isExpanded = (key: string) => shownFor(key) > initialCount(view, mode)

  const loadAll = (key: string, total: number) => {
    const from = shownFor(key)
    if (total <= from) return
    pending.current = { key, index: from }
    setState({ scope, counts: { ...counts, [key]: total } })
  }

  const collapse = (key: string) => {
    pending.current = { key, collapse: true }
    setState({ scope, counts: { ...counts, [key]: initialCount(view, mode) } })
  }

  const loadMore = (key: string) => {
    const from = shownFor(key)
    pending.current = { key, index: from }
    setState({ scope, counts: { ...counts, [key]: from + step(view, mode) } })
  }

  // The items render in the same commit as the new count, so focus can move in a layout effect
  useLayoutEffect(() => {
    const p = pending.current
    if (!p) return
    pending.current = null
    if ("collapse" in p) {
      const list = lists.current.get(p.key)
      // The unlabelled "None" group has no heading: land on its first item instead
      const target = headings.current.get(p.key) ?? (list?.children[0] as HTMLElement | undefined)
      target?.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" })
      target?.focus({ preventScroll: true })
      return
    }
    const el = lists.current.get(p.key)?.children[p.index] as HTMLElement | undefined
    el?.focus()
  })

  return { slice, listRef, headingRef, loadMore, loadAll, collapse, isExpanded, shownFor }
}
