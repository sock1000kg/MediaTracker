import { NextFunction, Request, Response } from "express"
import { AppError } from "@/api/domain/error.js"
import { getQueue } from "@/queue/index.js"
import type { JobInfo, JobName } from "@/queue/types.js"

// Names clients may filter by. Add new user-facing job names here.
const LISTABLE_JOBS: JobName[] = ["import.goodreads"]

const toPublic = (job: JobInfo) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { userId, ...publicJob } = job
    return publicJob
}

export const getJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (req.userId == null) throw new AppError("Unauthorized: missing userId", 401)
        const id = String(req.params.id)
        const job = await getQueue().getJob(id)
        if (!job || job.userId !== req.userId) throw new AppError("Job not found", 404)
        res.status(200).json(toPublic(job))
    } catch (e) { next(e) }
}

export const listJobs = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (req.userId == null) throw new AppError("Unauthorized: missing userId", 401)
        const name = typeof req.query.name === "string" ? req.query.name : undefined
        if (name !== undefined && !LISTABLE_JOBS.includes(name as JobName)) {
            throw new AppError("Unknown job name", 400)
        }
        const rawLimit = Number(req.query.limit)
        // Missing, empty or non-numeric limit means the default of 10
        const limit = req.query.limit === undefined || req.query.limit === "" || !Number.isFinite(rawLimit)
            ? 10
            : Math.min(20, Math.max(1, Math.floor(rawLimit)))
        const jobs = await getQueue().listJobs({ userId: req.userId, name: name as JobName | undefined, limit })
        res.status(200).json(jobs.map(toPublic))
    } catch (e) { next(e) }
}
