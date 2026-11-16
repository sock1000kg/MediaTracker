import type { LogStatus } from "@/types/mainTypes"

type DatedStatus = { status?: LogStatus | string | null; started_at?: string | null; finished_at?: string | null }

/**
 * Applies a status change to log form data. Switching to "in progress" with no start date
 * starts it today, unless a finish date before today would make that invalid.
 */
export function applyStatus<T extends DatedStatus>(prev: T, status: LogStatus, today: string): T {
  const next = { ...prev, status }
  const finished = prev.finished_at ? prev.finished_at.slice(0, 10) : ""
  if (status === "in progress" && !prev.started_at && (!finished || finished >= today)) {
    next.started_at = today
  }
  return next
}
