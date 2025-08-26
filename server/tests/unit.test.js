// __tests__/utils.test.js
import { checkPasswordStrength, 
  normalizeTypeName,
  sanitizeRating,
  sanitizeNotes,
  sanitizeTitle,
  sanitizeCreator,
  sanitizeStatus,
  sanitizeYear,
  sanitizeMetadata,
  sanitizeUsername,
  sanitizeDisplayName
} from "../src/utilities.js"

describe("checkPasswordStrength", () => {
  test("returns false for empty string", () => {
    expect(checkPasswordStrength("")).toBe(false)
  })

  test("fails if missing uppercase", () => {
    expect(checkPasswordStrength("password1!")).toBe(false)
  })

  test("fails if missing number", () => {
    expect(checkPasswordStrength("Password!")).toBe(false)
  })

  test("passes for valid strong password", () => {
    expect(checkPasswordStrength("StrongPass1!")).toBe(true)
  })
})

describe("normalizeTypeName", () => {
  test("trims whtestespace", () => {
    expect(normalizeTypeName("  Movie ")).toBe("movie")
  })

  test("lowercases the string", () => {
    expect(normalizeTypeName("BOOK")).toBe("book")
  })

  test("removes trailing 's'", () => {
    expect(normalizeTypeName("Games")).toBe("game")
  })

  test("leaves non-plural words unchanged", () => {
    expect(normalizeTypeName("anime")).toBe("anime")
  })
})

describe("sanitizeRating", () => {
  test("returns null for null/undefined", () => {
    expect(sanitizeRating(null)).toBeNull()
    expect(sanitizeRating(undefined)).toBeNull()
  })

  test("converts valid numbers within 0-100", () => {
    expect(sanitizeRating(50)).toBe(50)
    expect(sanitizeRating("75")).toBe(75)
  })

  test("invalid numbers return null", () => {
    expect(sanitizeRating(200)).toBeNull()
    expect(sanitizeRating(-5)).toBeNull()
    expect(sanitizeRating("abc")).toBeNull()
  })
})

describe("sanitizeNotes", () => {
  test("trims whitespace and limits length", () => {
    const input = " ".repeat(5) + "Hello World" + " ".repeat(5)
    expect(sanitizeNotes(input)).toBe("Hello World")
    expect(sanitizeNotes("a".repeat(6000)).length).toBe(5000)
  })

  test("returns null for empty or falsy values", () => {
    expect(sanitizeNotes("")).toBeNull()
    expect(sanitizeNotes(null)).toBeNull()
  })
})

describe("sanitizeTitle", () => {
  test("trims and limits length", () => {
    expect(sanitizeTitle("  My Title  ")).toBe("My Title")
    expect(sanitizeTitle("a".repeat(200)).length).toBe(100)
  })

  test("returns null for empty input", () => {
    expect(sanitizeTitle("")).toBeNull()
  })
})

describe("sanitizeCreator", () => {
  test("trims and limits length", () => {
    expect(sanitizeCreator("  John Doe  ")).toBe("John Doe")
    expect(sanitizeCreator("a".repeat(200)).length).toBe(100)
  })

  test("returns null for empty input", () => {
    expect(sanitizeCreator("")).toBeNull()
  })
})

describe("sanitizeStatus", () => {
  test("returns valid status only", () => {
    expect(sanitizeStatus("Completed")).toBe("completed")
    expect(sanitizeStatus("Wishlist")).toBe("wishlist")
  })

  test("returns null for invalid status", () => {
    expect(sanitizeStatus("Unknown")).toBeNull()
    expect(sanitizeStatus("")).toBeNull()
  })
})

describe("sanitizeYear", () => {
  test("returns integer numbers", () => {
    expect(sanitizeYear(2020)).toBe(2020)
    expect(sanitizeYear("1999")).toBe(1999)
  })

  test("returns null for non-integer", () => {
    expect(sanitizeYear(2020.5)).toBeNull()
    expect(sanitizeYear("abc")).toBeNull()
  })

})

describe("sanitizeMetadata", () => {
  test("returns object as-is", () => {
    const obj = { key: "value" }
    expect(sanitizeMetadata(obj)).toEqual(obj)
  })

  test("parses valid JSON string", () => {
    expect(sanitizeMetadata('{"key":"value"}')).toEqual({ key: "value" })
  })

  test("returns null for invalid JSON", () => {
    expect(sanitizeMetadata("{key: value}")).toBeNull()
    expect(sanitizeMetadata(null)).toBeNull()
  })
})

describe("sanitizeUsername", () => {
  test("trims, limits length, and enforces min 3 chars", () => {
    expect(sanitizeUsername("  Alice  ")).toBe("Alice")
    expect(sanitizeUsername("a".repeat(50)).length).toBe(30)
    expect(sanitizeUsername("   ab   ")).toBeNull()
    expect(sanitizeUsername("")).toBeNull()
    expect(sanitizeUsername(null)).toBeNull()
  })

  test("rejects whitespace inside username", () => {
    expect(sanitizeUsername("Test User")).toBeNull()
    expect(sanitizeUsername("Test\tUser")).toBeNull()
    expect(sanitizeUsername("Line\nBreak")).toBeNull()
  })

  test("accepts usernames without whitespace", () => {
    expect(sanitizeUsername("Alice123")).toBe("Alice123")
    expect(sanitizeUsername("Bob_")).toBe("Bob_")
  })
})

describe('sanitizeDisplayName', () => {
  test('trims leading/trailing whitespace', () => {
    expect(sanitizeDisplayName('   Alice   ')).toBe('Alice')
  })

  test('collapses multiple spaces into one', () => {
    expect(sanitizeDisplayName('John    Doe')).toBe('John Doe')
  })

  test('rejects empty string', () => {
    expect(sanitizeDisplayName('')).toBeNull()
  })
  test('rejects string with only spaces', () => {
    expect(sanitizeDisplayName('     ')).toBeNull()
  })

  test('rejects non-string values', () => {
    expect(sanitizeDisplayName(null)).toBeNull()
    expect(sanitizeDisplayName(undefined)).toBeNull()
    expect(sanitizeDisplayName(123)).toBeNull()
  })

  test('limits length to 50 characters', () => {
    const longName = 'a'.repeat(100)
    const result = sanitizeDisplayName(longName)
    expect(result.length).toBe(50)
  })
})