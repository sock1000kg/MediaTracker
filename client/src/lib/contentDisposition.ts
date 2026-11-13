/** Extracts a filename from a Content-Disposition header: filename* (RFC 5987) > filename="…" > null. */
export function parseContentDispositionFilename(header: string | null | undefined): string | null {
  if (!header) return null

  const star = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(header)
  if (star) {
    try {
      const decoded = decodeURIComponent(star[2].trim().replace(/^"|"$/g, ""))
      if (decoded) return decoded
    } catch {
      // fall through to plain filename
    }
  }

  const quoted = /(?:^|[;\s])filename\s*=\s*"((?:[^"\\]|\\.)*)"/i.exec(header)
  if (quoted) {
    const name = quoted[1].replace(/\\(.)/g, "$1")
    if (name) return name
  }

  const bare = /(?:^|[;\s])filename\s*=\s*([^;\s]+)/i.exec(header)
  return bare?.[1] || null
}

export function fallbackExportName(ext: string, now = new Date()): string {
  return `media-tracker-export-${now.toISOString().slice(0, 10)}.${ext}`
}
