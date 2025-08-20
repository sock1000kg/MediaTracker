// Simple password strength check
export function checkPasswordStrength(password) {
    if (!password) return false
    // At least 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/.test(password)
}

//Used in Media Type and Media to normalize names of media types
export function normalizeTypeName(name) {
    return name.trim().toLowerCase().replace(/s$/, "") // crude singularization
}

//INPUT SANITIZATION
// Sanitize rating between 0 and 100
export function sanitizeRating(rating) {
    if (rating == null) return null
    const num = Number(rating)
    if (isNaN(num)) return null
    return Math.min(Math.max(num, 0), 100)
}

// Sanitize notes: trim whitespace, limit length to 5000 chars
export function sanitizeNotes(notes) {
    if (!notes) return null
    return String(notes).trim().slice(0, 5000)
}

// Sanitize title: trim, limit length to 100 chars
export function sanitizeTitle(title) {
    if (!title) return null
    return String(title).trim().slice(0, 100)
}

// Sanitize creator: trim, limit length to 100 chars
export function sanitizeCreator(creator) {
    if (!creator) return null
    return String(creator).trim().slice(0, 100)
}

// Sanitize status: only allow known statuses
const allowedStatuses = ["Completed", "In progress", "Wishlist", "None"]
export function sanitizeStatus(status) {
    if (!status) return null
    const cleaned = String(status).trim()
    return allowedStatuses.includes(cleaned) ? cleaned : null
}

// Sanitize year: convert to number, allow any integer
export function sanitizeYear(year) {
    if (year == null) return null
    const num = Number(year)
    return Number.isInteger(num) ? num : null
}

// Sanitize metadata: make sure it's valid JSON/object
export function sanitizeMetadata(metadata) {
    if (!metadata) return null
    if (typeof metadata === "object") return metadata
    try {
        return JSON.parse(metadata)
    } catch {
        return null // invalid JSON
    }
}

// Sanitize username: max 30 chars, min 3 chars
export function sanitizeUsername(username) {
    if (!username) return null
    let clean = String(username).trim().slice(0, 30)
    // require at least 3 chars
    return clean.length >= 3 ? clean : null
}