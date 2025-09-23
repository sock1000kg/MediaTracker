import { NextFunction, Request, Response } from 'express'

import { createMediaAndLogSchema, googleBooksResponseSchema, SearchResult, searchResultsSchema } from '@/schemas/searchSchemas.js'
import { decryptKey, validateSchema } from '@/utilities.js'

import { createLog, findLogOfUserByMediaId, updateLog } from '@/controllers/dbCalls/logsCalls.js'
import { createMedia, findMediaBySource } from '@/controllers/dbCalls/mediaCalls.js'
import { findUserById, findUserByUsername } from '@/controllers/dbCalls/authCalls.js'
import { findMediaTypeForUserOrGlobal } from '@/controllers/dbCalls/mediaTypeCalls.js'

export const createMediaAndLog = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (!userId) 
        return res.status(401).json({ message: "Unauthorized" })

    try {
        //Validate inputs sent from frontend
        console.log("BODY RECEIVED:", req.body)
        const { mediaData, logData } = validateSchema(createMediaAndLogSchema, req.body)

        const bookType = await findMediaTypeForUserOrGlobal("book", userId)
        if(!bookType)
            return res.status(404).json({ message: "Could not find book type in system"})

        // Check if media exists in db, if not create a system media
        let media = await findMediaBySource(mediaData.sourceId, mediaData.source)
        if (!media) {
            const systemUser = await findUserByUsername("system")
            media = await createMedia(
                mediaData.title,
                bookType,
                mediaData.creator,
                mediaData.year,
                mediaData.source,
                mediaData.sourceId,
                mediaData.sourceRating,
                mediaData.ratingsCount,
                mediaData.description,
                mediaData.metadata,
                mediaData.imageUrl,
                systemUser.id // system id
            )
        }

        //Check if log exists
        const existingLog = await findLogOfUserByMediaId(userId, media.id)
        let newLog
        if (existingLog) {
            //Update log
            newLog = await updateLog(existingLog.id, logData.status, logData.rating, logData.notes)
        }
        else {
            // Create log
            newLog = await createLog(userId, media.id, logData.status, logData.rating, logData.notes)
        }
        
        res.status(201).json({ media, newLog })

    } catch (error) {
        next(error)
    }
}

// Returns the book info fetched from google books (A media shaped item without media type cus its enforced in frontend)
export async function searchBooks(req: Request, res: Response, next: NextFunction) {
    const userId = req.userId
    if (!userId) 
        return res.status(401).json({ message: "Unauthorized: missing userId" })

    const q = req.query.q as string
    if(!q) return res.status(404).json({ message: "Missing query" })

    // startIndex is google's search index (the index of the top searches array)
    const startIndex = parseInt(req.query.startIndex as string) || 0
    const maxResults = 15

    try{
        const user = await findUserById(userId)

        const decryptedApiKeys = user?.apiKeys.map(key => ({
            ...key,
            key: decryptKey(key.key)
        }))

        const userGoogleBooksKey = decryptedApiKeys?.find(key => key.service === "google_books")?.key

        //Form the API call
        const url = new URL("https://www.googleapis.com/books/v1/volumes")
        url.searchParams.set("q", q)
        url.searchParams.set("maxResults", maxResults.toString())
        url.searchParams.set("startIndex", startIndex.toString())

        if(!userGoogleBooksKey) {
            console.log("Books API key does not exist")
        }
        else {
            console.log("Books API key exists")
            url.searchParams.set("key", userGoogleBooksKey)
        }
        

        const response = await fetch(url.toString())
        if (!response.ok) {
            //parse as JSON, returns null if fails
            const errorBody = await response.json().catch(() => null)
            console.log(errorBody)
            return res.status(response.status).json({
                error: "Google Books API error",
                message: errorBody?.error?.message ?? "Invalid or unauthorized API key"
            })
        }

        //Parse raw data
        const raw = await response.json()
        console.log("RAW RECEIVED", raw.items?.[0]?.volumeInfo)
        const parsed = validateSchema(googleBooksResponseSchema, raw)

        //Map the raw data to array of individual items
        const rawResults =
            parsed.items?.map((item): SearchResult => {
                const { title, authors, publishedDate, averageRating, ratingsCount, description, imageLinks } = item.volumeInfo

                return {
                    title,
                    creator: authors ? authors.join() : null,
                    year: publishedDate ? publishedDate.split("-")[0] : null,
                    description: description ?? null,
                    imageUrl: imageLinks ? imageLinks.thumbnail : null,
                    source: "google_books",
                    sourceId: item.id,
                    sourceRating: averageRating !== null ? Math.round((averageRating / 5) * 100) : null,
                    ratingsCount: ratingsCount ?? null,
                    metadata: {
                        pageCount: item.volumeInfo.pageCount,
                        categories: item.volumeInfo.categories,
                        publisher: item.volumeInfo.publisher,
                    },
            }
        }) ?? []

        //If no results return
        if(!rawResults.length)
            return res.status(404).json({ message: "No item found"})
        
        //Validate raw searches so it match mediaSchema (searchResultSchema)
        const results = validateSchema(searchResultsSchema, rawResults)
        if (results) console.log(results)
        res.status(200).json(results)
    }catch(error){
        next(error)
    }
}