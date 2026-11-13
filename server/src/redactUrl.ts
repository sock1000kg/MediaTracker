// No imports and no side effects: safe to import from test setup files before env vars are loaded.
// Redact the password in a connection URL for logging. Never throws.
export function redactUrl(url: string | undefined | null): string {
    if (!url || !String(url).trim()) return "(unset)"
    try {
        const u = new URL(String(url).trim())
        if (u.password) u.password = "***"
        return u.toString()
    } catch {
        return "(invalid url)"
    }
}
