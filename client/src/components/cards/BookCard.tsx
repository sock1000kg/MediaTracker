import type { BookResult } from "@/types/search"
import { Fragment } from "react/jsx-runtime"
import { Button } from "../ui/button"

interface BookCardProps {
  book: BookResult
  onLog?: (book: BookResult) => void
}

export function BookCard({ book, onLog }: BookCardProps) {
  return (
    // Image
    <div className="flex gap-4 p-3 border rounded-lg bg-white shadow-sm">
        {book.imageUrl && (
            <img
            src={book.imageUrl}
            alt={book.title}
            className="w-20 h-28 object-cover rounded-md"
            />
        )}


        {/* Info */}
        <div className="flex flex-col flex-1">
            <div className="flex justify-between">
                <p className="font-semibold">{book.title}</p>

                {/* Logging button */}
                {onLog && (
                    <Button size="sm" variant="amber" onClick={() => onLog(book)}>
                    + Log
                    </Button>
                )}
            </div>

            {book.creator && <p className="text-sm text-gray-600">{book.creator}</p>}
            {book.year && <p className="text-sm text-gray-500">{book.year}</p>}

            {/* Metadata */}
            <div className="flex gap-2 flex-wrap text-xs text-stone-600">
                {Object.entries({
                    publisher: book.metadata?.publisher,
                    pageCount: book.metadata?.pageCount ? `${book.metadata.pageCount} pages` : null,
                })
                    .filter(([, value]) => value != null && value !== "") //get rid of empty fields
                    .map(([key, value], index, arr) => (
                        <Fragment key={key}>
                            <span className="flex gap-1 capitalize">
                            <span className="font-semibold">{key}:</span>
                            {String(value)}
                            </span>
                            {index < arr.length - 1 && <span>•</span>}
                        </Fragment>
                    ))}
            </div>

            <div>
                {book.metadata?.categories?.length && (
                    <div className="flex flex-wrap gap-1 mt-1"> 
                        {book.metadata.categories.map((cat) => ( 
                            <span 
                                key={cat} 
                                className="text-xs rounded-2xl px-2 py-0.5 bg-amber-100 text-amber-800" 
                            > 
                                {cat} 
                            </span> 
                        ))} 
                    </div> 
                )}

                {book.metadata?.url && (
                    <a
                        href={book.metadata.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs rounded-2xl px-2 py-0.5 bg-amber-100 text-amber-800 hover:underline"
                    >
                        View on Google Books
                    </a>
                )}
            </div>

            {/* Description */}
            <p className="text-xs text-gray-500 whitespace-pre-line max-h-48 overflow-y-auto mt-2 pr-1">
                {book.description}
            </p>
        </div>
    </div>
  )
}

