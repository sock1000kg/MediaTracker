export type ImportFailure = {
  row: number
  title: string
  reason: string
}

export type ImportResult = {
  imported: number
  skipped: number
  failures: ImportFailure[] // Return a list of specific errors
}