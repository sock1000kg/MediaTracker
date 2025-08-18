// Simple password strength check
export function checkPasswordStrength(password) {
    if (!password) return false;
    // At least 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/.test(password);
}

//Used in Media Type and Media
export function normalizeTypeName(name) {
    return name.trim().toLowerCase().replace(/s$/, ""); // crude singularization
}