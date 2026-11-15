import type { ZodError } from "zod"

/** Short log cause for a provider response that didn't match its schema, e.g. "unexpected response: results.0.id Expected number". */
export function unexpectedShape(error: ZodError): string {
    const issue = error.issues[0]
    return issue ? `unexpected response: ${issue.path.join(".") || "(root)"} ${issue.message}` : "unexpected response"
}
