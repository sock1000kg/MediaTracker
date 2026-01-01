import { z } from 'zod'

export const goodreadsRowSchema = z.object({
    "Title": z.string().min(1),
    "Author": z.string().min(1),
    "My Rating": z.number().min(0).max(5).default(0), 
    "Average Rating": z.number().optional(),
    "Publisher": z.string().optional(),
    "Binding": z.string().optional(),
    "Year Published": z.number().nullable().optional(),
    "Original Publication Year": z.number().nullable().optional(),
    "Date Read": z.string().optional(),
    "Date Added": z.string().optional(),
    "Bookshelves": z.string().optional(),
    "My Review": z.string().optional(),
    "Book Id": z.coerce.string().optional(),
    "ISBN": z.string().optional(),
});
export type GoodReadsRow = z.infer<typeof goodreadsRowSchema>