import { z } from 'zod'

export const goodreadsRowSchema = z.object({
    "Title": z.coerce.string({ message: "Title is missing" }).min(1, "Title cannot be empty"),
    "Author": z.string().min(1),
    "Additional Authors": z.string().optional(),
    // empty / non-numeric cell (csv-parse gives "") means unrated -> 0, which the service stores as null
    "My Rating": z.preprocess((v) => (typeof v === "number" ? v : undefined), z.number().min(0).max(5).default(0)),
    "Average Rating": z.number().optional(),
    "Publisher": z.string().optional(),
    "Binding": z.string().optional(),
    "Number of Pages": z.preprocess((v) => {
        if (typeof v === "number" && Number.isInteger(v) && v > 0) return v
        if (typeof v === "string" && /^\d+$/.test(v.trim())) {
            const n = parseInt(v.trim(), 10)
            return n > 0 ? n : undefined
        }
        return undefined
    }, z.number().int().positive().optional()),
    "Year Published": z.number().nullable().optional(),
    "Original Publication Year": z.coerce.number().nullable().optional(),
    "Date Read": z.string().optional(),
    "Date Added": z.string().optional(),
    "Exclusive Shelf": z.string().optional(),
    "My Review": z.string().optional(),
    "Book Id": z.coerce.string({ message: "Book Id is missing"}).min(1, "Book Id cannot be empty"),
    "ISBN": z.coerce.string().optional(), 
    "ISBN13": z.coerce.string().optional()
})
export type GoodReadsRow = z.infer<typeof goodreadsRowSchema>