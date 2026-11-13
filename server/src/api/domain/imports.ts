export type ImportFailure = {
  row: number
  title: string
  reason: string
}

export type ImportResult = {
  imported: number
  skipped: number
  failures: ImportFailure[] // Return a list of specific errors (capped, see failuresTruncated)
  failuresTruncated?: number // number of failures dropped from `failures` (0 when not capped)
}