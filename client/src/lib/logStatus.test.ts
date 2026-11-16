import { describe, expect, test } from "vitest"
import { applyStatus } from "./logStatus"

const today = "2026-11-16"

describe("applyStatus", () => {
  test("in progress with no start date starts today", () => {
    expect(applyStatus({ status: "wishlist", started_at: null }, "in progress", today))
      .toEqual({ status: "in progress", started_at: today })
  })

  test("keeps an existing start date", () => {
    expect(applyStatus({ status: "wishlist", started_at: "2026-01-02" }, "in progress", today).started_at).toBe("2026-01-02")
  })

  test("other statuses leave the start date alone", () => {
    expect(applyStatus({ status: "wishlist", started_at: null }, "completed", today).started_at).toBeNull()
  })

  test("skips when a past finish date would come before today", () => {
    expect(applyStatus({ started_at: null, finished_at: "2026-01-02" }, "in progress", today).started_at).toBeNull()
  })
})
