import { demoService } from "@/services/demoService.js"
import { getQueue } from "@/queue/index.js"
import { parse } from "csv-parse/sync"
import { NextFunction } from "express"
import type { Request, Response } from "express"

const IMPORT_JOB = "import.goodreads" as const

type CsvCheck = { ok: true } | { ok: false; message: string }

// Cheap pre-flight check: only the header and the row count. Row validation stays in the job.
function checkGoodreadsCsv(buffer: Buffer): CsvCheck {
    let rows: Record<string, unknown>[]
    try {
        rows = parse(buffer, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
            cast: true,
            bom: true,
        }) as Record<string, unknown>[]
    } catch {
        return { ok: false, message: "Couldn't read that CSV file" }
    }
    if (!Array.isArray(rows)) return { ok: false, message: "Couldn't read that CSV file" }
    if (rows.length === 0) return { ok: false, message: "The CSV has no rows" }
    if (!("Title" in rows[0]) || !("Author" in rows[0])) {
        return { ok: false, message: "This doesn't look like a Goodreads export (missing Title/Author columns)" }
    }
    return { ok: true }
}

export const importGoodReads = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized" })
    }

    // Multer puts the file in req.file
    if (!req.file) {
        return res.status(400).json({ message: "No CSV file uploaded" })
    }

    const MAX_FILE_SIZE = 2*1024*1024
    if (req.file.size > MAX_FILE_SIZE) {
        return res.status(400).json({ message: "Max file size is 2MB" })
    }

    try {
        await demoService.ensureNotDemo(userId)

        const check = checkGoodreadsCsv(req.file.buffer)
        if (!check.ok) {
            return res.status(400).json({ message: check.message })
        }

        // One import at a time per user. A rare race between two simultaneous uploads is
        // acceptable because the import is idempotent (existing logs are skipped).
        const queue = getQueue()
        const recent = await queue.listJobs({ userId, name: IMPORT_JOB, limit: 5 })
        const running = recent.find((j) => j.status === "queued" || j.status === "active")
        if (running) {
            return res.status(409).json({ message: "An import is already running", jobId: running.id })
        }

        const { id } = await queue.enqueue(
            IMPORT_JOB,
            { csv: req.file.buffer.toString("utf8") },
            { userId, attempts: 1, clearPayloadOnFinish: true },
        )
        res.status(202).json({ jobId: id })
    } catch (error) {
        next(error)
    }
}
