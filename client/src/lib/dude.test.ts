import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  dudeReducer,
  dudeSay,
  initialDudeState,
  DUDE_SAY_EVENT,
  type DudeState,
} from "./dude"

describe("dude logic & events", () => {
  beforeEach(() => {
    const target = new EventTarget()
    // @ts-expect-error mock window for node vitest environment
    globalThis.window = target
    // @ts-expect-error mock CustomEvent for node
    globalThis.CustomEvent = class CustomEvent<T> extends Event {
      detail: T
      constructor(type: string, options?: { detail?: T }) {
        super(type)
        this.detail = options?.detail as T
      }
    }
  })
  describe("dudeSay bus", () => {
    it("dispatches DUDE_SAY_EVENT with text and ms on window", () => {
      const listener = vi.fn()
      window.addEventListener(DUDE_SAY_EVENT, listener)

      dudeSay("Looking good!", 4000)

      expect(listener).toHaveBeenCalledTimes(1)
      const event = listener.mock.calls[0][0] as CustomEvent<{ text: string; ms?: number }>
      expect(event.detail).toEqual({ text: "Looking good!", ms: 4000 })

      window.removeEventListener(DUDE_SAY_EVENT, listener)
    })

    it("defaults ms to undefined when not supplied", () => {
      const listener = vi.fn()
      window.addEventListener(DUDE_SAY_EVENT, listener)

      dudeSay("Quick quip")

      expect(listener).toHaveBeenCalledTimes(1)
      const event = listener.mock.calls[0][0] as CustomEvent<{ text: string; ms?: number }>
      expect(event.detail).toEqual({ text: "Quick quip", ms: undefined })

      window.removeEventListener(DUDE_SAY_EVENT, listener)
    })
  })

  describe("dudeReducer - say action", () => {
    it("sets bubble with text and ms", () => {
      const state: DudeState = { ...initialDudeState }
      const next = dudeReducer(state, { type: "say", text: "Stats line here", ms: 5000 })

      expect(next.bubble).toEqual({
        id: 1,
        text: "Stats line here",
        ms: 5000,
      })
      expect(next.bubbleCount).toBe(1)
    })

    it("increments bubble id on subsequent say actions", () => {
      let state = dudeReducer(initialDudeState, { type: "say", text: "First", ms: 3000 })
      expect(state.bubble?.id).toBe(1)

      state = dudeReducer(state, { type: "say", text: "Second", ms: 3000 })
      expect(state.bubble?.id).toBe(2)
      expect(state.bubble?.text).toBe("Second")
    })

    it("clears bubble on hide action", () => {
      let state = dudeReducer(initialDudeState, { type: "say", text: "First", ms: 3000 })
      expect(state.bubble).not.toBeNull()

      state = dudeReducer(state, { type: "hide" })
      expect(state.bubble).toBeNull()
    })
  })

  describe("dude sleeping state", () => {
    it("ignores poke actions while asleep", () => {
      const asleepState: DudeState = { ...initialDudeState, asleep: true }
      const next = dudeReducer(asleepState, { type: "poke" })
      expect(next).toBe(asleepState)
    })

    it("wakes up on wake action", () => {
      const asleepState: DudeState = { ...initialDudeState, asleep: true, clicks: 12 }
      const next = dudeReducer(asleepState, { type: "wake" })
      expect(next.asleep).toBe(false)
      expect(next.clicks).toBe(0)
    })
  })
})
