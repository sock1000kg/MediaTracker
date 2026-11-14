import { describe, expect, it } from "vitest"
import {
  moveItem,
  buildOrderPayload,
  normalizeCollectionName,
  collectionKey,
  membershipDiff,
  coverMosaic,
} from "./collectionHelpers"

describe("collectionHelpers", () => {
  describe("moveItem", () => {
    const list = ["A", "B", "C", "D"]

    it("moves an item forward", () => {
      expect(moveItem(list, 0, 2)).toEqual(["B", "C", "A", "D"])
    })

    it("moves an item backward", () => {
      expect(moveItem(list, 3, 1)).toEqual(["A", "D", "B", "C"])
    })

    it("returns shallow copy if indices are equal", () => {
      expect(moveItem(list, 1, 1)).toEqual(list)
    })

    it("returns shallow copy if indices are out of range", () => {
      expect(moveItem(list, -1, 2)).toEqual(list)
      expect(moveItem(list, 0, 10)).toEqual(list)
    })

    it("does not mutate the source array", () => {
      const copy = [...list]
      moveItem(copy, 0, 3)
      expect(copy).toEqual(list)
    })
  })

  describe("buildOrderPayload", () => {
    it("handles number array", () => {
      expect(buildOrderPayload([10, 20, 30])).toEqual({ logIds: [10, 20, 30] })
    })

    it("handles { logId: number } items", () => {
      expect(buildOrderPayload([{ logId: 5 }, { logId: 15 }])).toEqual({ logIds: [5, 15] })
    })

    it("handles { log: { id: number } } items", () => {
      expect(
        buildOrderPayload([{ log: { id: 101 } }, { log: { id: 102 } }])
      ).toEqual({ logIds: [101, 102] })
    })
  })

  describe("normalizeCollectionName & collectionKey", () => {
    it("trims and collapses whitespace", () => {
      expect(normalizeCollectionName("   Best   Sci-Fi   ")).toBe("Best Sci-Fi")
    })

    it("returns null for empty or whitespace-only", () => {
      expect(normalizeCollectionName("")).toBeNull()
      expect(normalizeCollectionName("   ")).toBeNull()
      expect(normalizeCollectionName(null)).toBeNull()
    })

    it("returns null for names exceeding 80 chars", () => {
      expect(normalizeCollectionName("x".repeat(81))).toBeNull()
      expect(normalizeCollectionName("x".repeat(80))).toBe("x".repeat(80))
    })

    it("collectionKey converts to lowercase", () => {
      expect(collectionKey("  Favorites  ")).toBe("favorites")
      expect(collectionKey("")).toBe("")
    })
  })

  describe("membershipDiff", () => {
    it("computes added and removed ids", () => {
      const initial = [1, 2, 3]
      const selected = [2, 3, 4, 5]
      const diff = membershipDiff(initial, selected)
      expect(diff.added).toEqual([4, 5])
      expect(diff.removed).toEqual([1])
    })

    it("works with Sets", () => {
      const initial = new Set([10, 20])
      const selected = new Set([20, 30])
      const diff = membershipDiff(initial, selected)
      expect(diff.added).toEqual([30])
      expect(diff.removed).toEqual([10])
    })

    it("returns empty arrays when unchanged", () => {
      const initial = [1, 2]
      const selected = [1, 2]
      const diff = membershipDiff(initial, selected)
      expect(diff.added).toEqual([])
      expect(diff.removed).toEqual([])
    })
  })

  describe("coverMosaic", () => {
    it("returns 4 slots with null padding", () => {
      expect(coverMosaic(["a", "b"])).toEqual(["a", "b", null, null])
      expect(coverMosaic([])).toEqual([null, null, null, null])
      expect(coverMosaic(null)).toEqual([null, null, null, null])
    })

    it("limits to first 4 non-empty covers", () => {
      expect(coverMosaic(["1", "2", "3", "4", "5"])).toEqual(["1", "2", "3", "4"])
      expect(coverMosaic(["a", "", "  ", null, "b"])).toEqual(["a", "b", null, null])
    })
  })
})
