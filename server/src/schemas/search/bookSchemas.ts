import { z } from "zod"

export const bookMetadataSchema = z.object({
    pageCount: z.number().nullable().optional(),
    categories: z.array(z.string()).nullable().optional(), // 👈 Now TS knows this is an array!
    publisher: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    isbn: z.string().nullable().optional(),
})

export type BookMetadata = z.infer<typeof bookMetadataSchema>

//GOOGLE BOOKS SEARCH (DEPRECATED)
//For info of each book fetched from GG Books
const bookVolumeInfoSchema = z.object({
    title: z
        .string()
        .optional()
        .transform(val => val ?? "Unknown title"),
    authors: z
        .array(z.string())
        .nullable()
        .default(null),
    publishedDate: z
        .string()
        .nullable()
        .default(null),
    description: z
        .string()
        .nullable()
        .default(null),
    imageLinks: z.object({
        thumbnail: z
            .string()
            .nullable()
            .default(null)
    }).nullable().default(null),
    averageRating: z
        .number()
        .nullable()
        .default(null),
    pageCount: z
        .number()
        .nullable()
        .default(null),
    categories: z
        .array(z.string())
        .nullable()
        .default(null),
    publisher: z
        .string()
        .nullable()
        .default(null),
    infoLink: z
        .string()
        .nullable()
        .default(null),
}).loose() //allow extra stuff

//For an item of book
export const googleBookSchema = z.object({
  id: z.string(),
  volumeInfo: bookVolumeInfoSchema,
})

export type GoogleBook = z.infer<typeof googleBookSchema>

//For response of a buncha books
export const googleBooksResponseSchema = z.object({
    items: z
        .array(googleBookSchema)
        .nullable()
        .default(null)
})


// OPEN LIBRARY SEARCH
// Schema for a single book from Open Library Search API
export const openLibraryBookSchema = z.object({
    key: z.string(), // e.g., "/works/OL123W"
    title: z.string().optional().default("Unknown title"),
    author_name: z.array(
        z.string())
        .optional()
        .nullable(),
    first_publish_year: z.number().optional().nullable(),
    cover_i: z.number().optional().nullable(), // Cover ID
    number_of_pages_median: z.number().optional().nullable(),
    publisher: z.array(z.string()).optional().nullable(),
    subject: z.array(
        z.string())
        .optional()
        .nullable(), // Categories
    isbn: z.array(z.string()).optional().nullable(),
}).loose() // Open Library returns a lot of fields we don't need

export type OpenLibraryBook = z.infer<typeof openLibraryBookSchema>

// Schema for the API response
export const openLibraryResponseSchema = z.object({
    numFound: z.number(),
    start: z.number().optional(),
    docs: z.array(openLibraryBookSchema).default([])
})

// BOOK SEARCH QUERY (what the client may send to GET /search/books)
// Empty strings from the query string count as "not provided"
const emptyToUndefined = (val: unknown) => (val === "" ? undefined : val)

const optionalText = z.preprocess(
    emptyToUndefined,
    z.string().trim().max(100, "Must be at most 100 characters").optional()
)

const optionalYear = z.preprocess(
    emptyToUndefined,
    z.coerce.number().int("Year must be an integer").min(0).max(2100).optional()
)

export const bookSearchQuerySchema = z.object({
    q: z.string("Search query must be at least 3 characters")
        .trim()
        .min(3, "Search query must be at least 3 characters")
        .max(100, "Search query must be at most 100 characters"),
    page: z.preprocess(
        emptyToUndefined,
        z.coerce.number().int().positive().default(1)
    ),
    author: optionalText,
    subject: optionalText,
    language: z.preprocess(
        emptyToUndefined,
        z.string().regex(/^[a-z]{3}$/, "Language must be a 3-letter lowercase ISO 639-2 code").optional()
    ),
    yearFrom: optionalYear,
    yearTo: optionalYear,
    sort: z.preprocess(
        emptyToUndefined,
        z.enum(["relevance", "new", "old", "rating"]).default("relevance")
    ),
}).refine(
    d => d.yearFrom === undefined || d.yearTo === undefined || d.yearFrom <= d.yearTo,
    { message: "yearFrom must be less than or equal to yearTo", path: ["yearFrom"] }
)

export type BookSearchQuery = z.infer<typeof bookSearchQuerySchema>
export type BookSearchFilters = Omit<BookSearchQuery, "q" | "page">
