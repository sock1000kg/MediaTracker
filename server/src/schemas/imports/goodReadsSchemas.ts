import { z } from 'zod'

export const goodreadsRowSchema = z.object({
    "Title": z.coerce.string().min(1),
    "Author": z.string().min(1),
    "Additional Authors": z.string().optional(),
    "My Rating": z.number().min(0).max(5).default(0), 
    "Average Rating": z.number().optional(),
    "Publisher": z.string().optional(),
    "Binding": z.string().optional(),
    "Year Published": z.number().nullable().optional(),
    "Original Publication Year": z.coerce.number().nullable().optional(),
    "Date Read": z.string().optional(),
    "Date Added": z.string().optional(),
    "Exclusive Shelf": z.string().optional(),
    "My Review": z.string().optional(),
    "Book Id": z.coerce.string().optional(),
    "ISBN": z.coerce.string().optional(), 
    "ISBN13": z.coerce.string().optional()
})
export type GoodReadsRow = z.infer<typeof goodreadsRowSchema>