import { describe, expect, it } from "vitest"
import {
  PLACEMENTS, SEARCH_PAGES, contentArea, eyePoints, eyePointsOnScreen, placementStyle, transformCss, type Placement,
} from "./backdropPlacements"

const VPS = [{ width: 1280, height: 800 }, { width: 1920, height: 1080 }, { width: 375, height: 667 }]

describe("backdropPlacements", () => {
  for (const page of SEARCH_PAGES)
    for (const vp of VPS)
      it(`${page} keeps both eyes on screen at ${vp.width}x${vp.height}`, () => {
        expect(eyePointsOnScreen(PLACEMENTS[page], vp)).toBe(true)
      })

  it("gives every page a distinct placement", () => {
    const sigs = Object.values(PLACEMENTS).map((p) => JSON.stringify(p))
    expect(new Set(sigs).size).toBe(Object.keys(PLACEMENTS).length)
    const poses = SEARCH_PAGES.map((p) => PLACEMENTS[p].rotateDeg + "/" + JSON.stringify(PLACEMENTS[p].anchor))
    expect(new Set(poses).size).toBe(SEARCH_PAGES.length)
  })

  it("the eyes check can fail: fully off-screen and just outside", () => {
    const off: Placement = { anchor: { left: { vh: -300 }, top: { vh: -300 } }, sizeVh: 90, rotateDeg: 0 }
    const outside: Placement = { anchor: { left: { vh: 500 }, top: { vh: 0 } }, sizeVh: 90, rotateDeg: 0 }
    expect(eyePointsOnScreen(off, VPS[0])).toBe(false)
    expect(eyePointsOnScreen(outside, VPS[0])).toBe(false)
  })

  it("draws every search page as big as the Logs dude", () => {
    for (const page of SEARCH_PAGES) expect(PLACEMENTS[page].sizeVh).toBe(PLACEMENTS.logs.sizeVh)
  })

  it("contentArea subtracts the sidebar only on desktop", () => {
    expect(contentArea(VPS[0])).toEqual({ width: 1040, height: 800 })
    expect(contentArea(VPS[2])).toEqual({ width: 375, height: 667 })
  })

  it("eyePoints: unrotated eyes sit at 5.5/16 down, 5.5/16 and 10.5/16 across", () => {
    const e = eyePoints({ anchor: { left: { vh: 0 }, top: { vh: 0 } }, sizeVh: 80, rotateDeg: 0 }, VPS[0])
    expect(e[0].x).toBeCloseTo((5.5 / 16) * 640, 6)
    expect(e[1].x).toBeCloseTo((10.5 / 16) * 640, 6)
    expect(e[0].y).toBeCloseTo((5.5 / 16) * 640, 6)
  })

  it("flipX mirrors x about the centre", () => {
    const base: Placement = { anchor: { left: { vh: 0 }, top: { vh: 0 } }, sizeVh: 80, rotateDeg: 0 }
    const e = eyePoints(base, VPS[0])
    const f = eyePoints({ ...base, flipX: true }, VPS[0])
    expect(f[0].x).toBeCloseTo(640 - e[0].x, 6)
  })

  it("keeps the original Logs CSS", () => {
    expect(placementStyle(PLACEMENTS.logs)).toEqual({
      width: "120vh", height: "120vh", transform: "rotate(-8deg)", right: "-20vh", bottom: "-25vh",
    })
    expect(transformCss(PLACEMENTS.games)).toBe("rotate(-90deg) scaleX(-1)")
  })
})
