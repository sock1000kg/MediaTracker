export type JobStatus = "queued" | "active" | "completed" | "failed"

export type JobInfo<R = unknown> = {
  id: string
  name: string
  status: JobStatus
  progress: number // 0-100
  result: R | null
  error: string | null
  createdAt: string
  finishedAt: string | null
}
