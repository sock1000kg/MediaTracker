import { startDateForInProgress } from "@/services/logService.js"

const now = new Date("2026-11-16T08:30:00Z")
const today = new Date(Date.UTC(2026, 10, 16, 12))

describe("startDateForInProgress", () => {
    it("starts an in-progress log with no start date today", () => {
        expect(startDateForInProgress("in progress", null, null, now)).toEqual(today)
    })

    it("keeps an existing start date", () => {
        expect(startDateForInProgress("in progress", new Date("2026-01-02T12:00:00Z"), null, now)).toBeNull()
    })

    it("ignores other statuses", () => {
        expect(startDateForInProgress("completed", null, null, now)).toBeNull()
        expect(startDateForInProgress(null, null, null, now)).toBeNull()
    })

    it("skips when the finish date is before today", () => {
        expect(startDateForInProgress("in progress", null, new Date("2026-01-02T12:00:00Z"), now)).toBeNull()
    })
})
