import { z } from "zod"

//BOOKS SEARCH
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