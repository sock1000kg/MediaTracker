import { importGoodReads } from "@/api/imports"
import { Button } from "@/components/ui/button"
import { fetchLogsQueryOptions } from "@/queryOptions/fetchLogsQueryOptions"
import type { ImportResult } from "@/types/imports"
import { Label } from "@radix-ui/react-label"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

export function ImportsForm() {
    const queryClient = useQueryClient()
    
    // state to manage file selection and result display
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [importResult, setImportResult] = useState<ImportResult | null>(null)
    const [serverMessage, setServerMessage] = useState<string | null>(null)

    const importMutation = useMutation({
        mutationFn: importGoodReads,
        onSuccess: (data: ImportResult) => {
            setImportResult(data)
            setServerMessage(null)
            setSelectedFile(null)

            queryClient.refetchQueries({ queryKey: fetchLogsQueryOptions().queryKey })
        },
        onError: (error: Error) => {
            setServerMessage(error.message || "Import failed")
            setTimeout(() => setServerMessage(null), 3000)
        }
    })

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0])
            setImportResult(null) // Reset previous results when picking new file
            setServerMessage(null)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedFile) return
        
        await importMutation.mutateAsync(selectedFile)
    }

    return (
        <div className="px-4">
            {/* Info Text */}
            <p className="text-gray-500 text-sm">
                Import your library from an export.
            </p>
            <p className="text-gray-500 text-xs mb-4">
                The imported medias will not be in the 'Your Medias' tab
            </p>

            {/* Header / Loading State */}
            {importMutation.isPending && (
                <p className="text-gray-500 animate-pulse">Processing CSV... this might take a moment.</p>
            )}
            
            {/* General Error Message */}
            {serverMessage && (
                <p className="text-center text-sm text-red-500 mb-4">
                    {serverMessage}
                </p>
            )}

            {/* FORM AREA */}
            <form onSubmit={handleSubmit} className="mb-6">
                <Label className="block mb-4">
                    <span className="text-stone-800 font-medium">Goodreads Export (.csv)</span>
                    <div className="flex gap-4 mt-1 items-center">
                        <input
                            type="file"
                            accept=".csv"
                            onChange={handleFileChange}
                            className="block w-full text-sm text-gray-500
                                file:mr-4 file:py-2 file:px-4
                                file:rounded-md file:border-0
                                file:text-sm file:font-semibold
                                file:bg-amber-50 file:text-amber-700
                                hover:file:bg-amber-100
                                border border-gray-300 rounded-md cursor-pointer"
                        />

                        <Button
                            type="submit"
                            variant="amber"
                            disabled={!selectedFile || importMutation.isPending}
                        >
                            {importMutation.isPending ? "Importing..." : "Upload"}
                        </Button>
                    </div>
                </Label>
            </form>

            {/* RESULT REPORT CARD */}
            {importResult && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 text-sm">
                    <h3 className="font-semibold text-gray-700 mb-2">Import Summary</h3>
                    <div className="grid grid-cols-3 gap-4 mb-4 text-center">
                        <div className="p-2 bg-green-100 rounded text-green-800">
                            <span className="block text-xl font-bold">{importResult.imported}</span>
                            Imported
                        </div>
                        <div className="p-2 bg-blue-100 rounded text-blue-800">
                            <span className="block text-xl font-bold">{importResult.skipped}</span>
                            Skipped
                        </div>
                        <div className={`p-2 rounded ${importResult.failures.length > 0 ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'}`}>
                            <span className="block text-xl font-bold">{importResult.failures.length}</span>
                            Failed
                        </div>
                    </div>

                    {/* DETAILED FAILURE LIST */}
                    {importResult.failures.length > 0 && (
                        <div className="mt-4">
                            <p className="font-semibold text-red-600 mb-2">Error Details:</p>
                            <div className="max-h-40 overflow-y-auto bg-white border rounded p-2 text-xs">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="border-b text-gray-500">
                                            <th className="py-1 w-12">Row</th>
                                            <th className="py-1">Title</th>
                                            <th className="py-1">Reason</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {importResult.failures.map((fail, idx) => (
                                            <tr key={idx} className="border-b last:border-0 hover:bg-red-50">
                                                <td className="py-1 text-gray-500">{fail.row === -1 ? "-" : fail.row}</td>
                                                <td className="py-1 font-medium truncate max-w-[150px]" title={fail.title}>
                                                    {fail.title}
                                                </td>
                                                <td className="py-1 text-red-600 truncate max-w-[200px]" title={fail.reason}>
                                                    {fail.reason}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

