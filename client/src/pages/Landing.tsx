import { useState } from "react"
import { Link } from "react-router-dom"

import BlueDude from "@/components/BlueDude"
import ThemeIconSwitch from "@/components/ThemeIconSwitch"
import type { Glance } from "@/lib/dude"

import handLeft from "@/assets/landing/hand-left.png"
import handRight from "@/assets/landing/hand-right.png"

export default function Landing() {
  const [glance, setGlance] = useState<Glance>(null)

  return (
    <div className="flex min-h-dvh flex-col justify-between px-4 sm:px-6 py-6 max-w-5xl mx-auto overflow-x-hidden">
      {/* Top row */}
      <header className="flex items-center justify-between">
        <span className="font-display text-2xl font-semibold">MediaTracker</span>
        <ThemeIconSwitch />
      </header>

      {/* Main hero */}
      <main className="flex flex-1 flex-col items-center justify-center text-center my-8">
        <div className="space-y-3 max-w-2xl">
          <h1 className="font-display text-4xl sm:text-5xl text-balance font-semibold tracking-tight">
            Log everything you read, watch, play and listen to.
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg text-balance">
            Books, music, anime, movies, TV, games and board games, in one journal you can host yourself.
          </p>
        </div>

        {/* The offer (the centrepiece) */}
        <div className="relative mt-12 mb-6 flex flex-col items-center justify-center">
          {/* The dude + hands illustration as one role="img" */}
          <div
            role="img"
            aria-label="The blue guy holding out two buttons, one in each hand"
            className="relative flex items-center justify-center select-none"
          >
            {/* Left hand */}
            <img
              src={handLeft}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute z-10 w-20 h-20 md:w-40 md:h-40 -left-16 md:-left-32 top-4 md:top-8 hand-bob-left dark:drop-shadow-[0_0_0.5px_var(--foreground)]"
              style={{ imageRendering: "pixelated" }}
            />

            {/* Center dude */}
            <BlueDude
              size={160}
              glance={glance}
              className="relative z-0 w-20 h-20 md:w-40 md:h-40 shrink-0"
            />

            {/* Right hand */}
            <img
              src={handRight}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute z-10 w-20 h-20 md:w-40 md:h-40 -right-16 md:-right-32 top-4 md:top-8 hand-bob-right dark:drop-shadow-[0_0_0.5px_var(--foreground)]"
              style={{ imageRendering: "pixelated" }}
            />
          </div>

          {/* Buttons: on the palms from md up, in a row under the dude below md.
              From md the box is the 160px dude; each hand is 160px, 128px out to the side and 32px down,
              so a palm's centre lands about 136px either side of the dude's centre and ~104px down.
              w-max stops the right span shrinking (its left edge is past the 160px box) and wrapping the text.
              The positioning lives on wrapper spans so the pills' own active:translate-y-px still works. */}
          <div className="relative z-20 flex flex-col-reverse min-[375px]:flex-row items-center justify-center gap-3 mt-6 md:mt-0 md:absolute md:inset-0 md:block">
            <span className="md:absolute md:left-[-56px] md:top-[104px] md:w-max md:-translate-x-1/2 md:-translate-y-1/2">
            <a
              href="https://sock1000kg.io.vn/"
              onMouseEnter={() => setGlance("left")}
              onMouseLeave={() => setGlance(null)}
              onFocus={() => setGlance("left")}
              onBlur={() => setGlance(null)}
              className="inline-flex whitespace-nowrap min-h-[44px] md:h-12 items-center justify-center rounded-full border-2 border-black bg-[var(--dude)] px-5 md:px-6 text-sm font-medium text-[#1d1916] transition-transform active:translate-y-px dark:drop-shadow-[0_0_0.5px_var(--foreground)]"
            >
              Check me out
            </a>
            </span>

            <span className="md:absolute md:left-[216px] md:top-[104px] md:w-max md:-translate-x-1/2 md:-translate-y-1/2">
            <Link
              to="/login"
              onMouseEnter={() => setGlance("right")}
              onMouseLeave={() => setGlance(null)}
              onFocus={() => setGlance("right")}
              onBlur={() => setGlance(null)}
              className="inline-flex whitespace-nowrap min-h-[44px] md:h-12 items-center justify-center rounded-full border-2 border-black bg-primary px-6 md:px-7 text-sm md:text-base font-semibold text-primary-foreground transition-transform active:translate-y-px dark:drop-shadow-[0_0_0.5px_var(--foreground)]"
            >
              Try it out
            </Link>
            </span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-muted-foreground space-y-1">
        <p>
          <a
            href="https://github.com/sock1000kg/MediaTracker"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-foreground"
          >
            GitHub
          </a>
        </p>
        <p>Data from Open Library, Last.fm, AniList, TMDB, RAWG and BoardGameGeek.</p>
      </footer>
    </div>
  )
}
