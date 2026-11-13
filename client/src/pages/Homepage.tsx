import { useEffect, useRef, useState } from "react"

import { usePreferences } from "@/hooks/usePreferences"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import ThemeToggle from "@/components/ThemeToggle"
import SidebarDude from "@/components/SidebarDude"
import { useNavGlance } from "@/hooks/useNavGlance"
import { useIsDesktop } from "@/hooks/useIsDesktop"
import LogsSection from "@/pages/sections/LogSection"
import MediasSection from "@/pages/sections/MediaSection"
import MediaTypesSection from "@/pages/sections/MediaTypeSection"
import BooksSearchSection from "@/pages/sections/BookSearchSection"
import MusicSearchSection from "@/pages/sections/MusicSearchSection"
import AnimeSearchSection from "@/pages/sections/AnimeSearchSection"
import MovieSearchSection from "@/pages/sections/MovieSearchSection"
import GameSearchSection from "@/pages/sections/GameSearchSection"
import Settings from "@/pages/sections/Settings"

import { BookOpen, Clapperboard, Film, Gamepad2, Layers, Library, Menu, Music, ScrollText, Settings as SettingsIcon, type LucideIcon } from "lucide-react"

export type Tab = "logs" | "medias" | "mediaTypes" | "settings" | "bookSearch" | "musicSearch" | "animeSearch" | "movieSearch" | "gameSearch" | "defaultSearch" //Tabs in homepage

interface NavItem { tab: Tab; label: string; icon: LucideIcon }

const NAV_ITEMS: NavItem[] = [
  { tab: "logs", label: "Logs", icon: ScrollText },
  { tab: "medias", label: "Your media", icon: Library },
  { tab: "mediaTypes", label: "Media types", icon: Layers },
]

const FIND_ITEMS: NavItem[] = [
  { tab: "bookSearch", label: "Books", icon: BookOpen },
  { tab: "musicSearch", label: "Music", icon: Music },
  { tab: "animeSearch", label: "Anime & manga", icon: Clapperboard },
  { tab: "movieSearch", label: "Movies", icon: Film },
  { tab: "gameSearch", label: "Games", icon: Gamepad2 },
]

const SETTINGS_ITEM: NavItem = { tab: "settings", label: "Settings", icon: SettingsIcon }

export default function Homepage() {
  const [activeTab, setActiveTab] = useState<Tab>("logs")
  const [menuOpen, setMenuOpen] = useState(false)
  const isDesktop = useIsDesktop()
  const { glance, navProps } = useNavGlance()
  const { prefs, isLoaded } = usePreferences()
  const tabTouched = useRef(false)
  const defaultTabApplied = useRef(false)
  const chooseTab = (tab: Tab) => {
    tabTouched.current = true
    setActiveTab(tab)
    setMenuOpen(false)
  }

  // Don't let the sheet reopen by itself when the window is narrowed again
  useEffect(() => {
    if (isDesktop) setMenuOpen(false)
  }, [isDesktop])

  // Adopt the saved start tab once, unless the user already navigated
  useEffect(() => {
    if (!isLoaded || defaultTabApplied.current) return
    defaultTabApplied.current = true
    if (!tabTouched.current && prefs.defaultTab) setActiveTab(prefs.defaultTab)
  }, [isLoaded, prefs.defaultTab])

  const renderItem = ({ tab, label, icon: Icon }: NavItem) => {
    const active = activeTab === tab
    return (
      <Button
        key={tab}
        variant="ghost"
        aria-current={active ? "page" : undefined}
        className={`h-9 w-full justify-start gap-3 rounded-lg px-3 text-sm ${
          active
            ? "bg-card font-semibold text-foreground hover:bg-card hover:text-foreground dark:hover:bg-card"
            : "font-normal text-muted-foreground hover:bg-card/60 hover:text-foreground dark:hover:bg-card/60"
        }`}
        onClick={() => chooseTab(tab)}
        {...navProps}
      >
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        {label}
      </Button>
    )
  }

  const navList = (
    <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
      {NAV_ITEMS.map(renderItem)}
      <p className="mt-5 mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Find something</p>
      {FIND_ITEMS.map(renderItem)}
      <div className="mt-auto flex flex-col gap-1 pt-4">
        {renderItem(SETTINGS_ITEM)}
        <ThemeToggle />
      </div>
    </nav>
  )

  const logo = (
    <div className="flex items-center gap-2">
      <SidebarDude glance={glance} size={32} />
      <span className="font-display text-lg font-semibold">MediaTracker</span>
    </div>
  )

  return (
    <div className={`flex h-screen ${isDesktop ? "flex-row" : "flex-col"}`}>
      {isDesktop ? (
        /* Left sidebar (≥ 1024px) */
        <aside className="flex w-60 shrink-0 flex-col gap-4 border-r border-border bg-sidebar p-4">
          {logo}
          {navList}
        </aside>
      ) : (
        <>
          {/* Top bar (< 1024px) */}
          <header className="flex shrink-0 items-center justify-between border-b border-border bg-sidebar px-4 py-2">
            {logo}
            <Button variant="ghost" size="icon" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
              <Menu />
            </Button>
          </header>
          <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
            <DialogContent className="top-0 left-0 flex h-dvh max-h-dvh w-72 max-w-[85vw] translate-x-0 translate-y-0 flex-col gap-4 rounded-none rounded-r-lg bg-sidebar p-4 data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 sm:max-w-[85vw]">
              <DialogTitle className="font-display">Menu</DialogTitle>
              <DialogDescription className="sr-only">Navigate between pages</DialogDescription>
              {navList}
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* Display user's contents */}
      <main className="min-w-0 flex-1 overflow-hidden">
        {activeTab === "logs" && <LogsSection/>}
        {activeTab === "medias" && <MediasSection />}
        {activeTab === "mediaTypes" && <MediaTypesSection />}
        {activeTab === "bookSearch" && <BooksSearchSection />}
        {activeTab === "musicSearch" && <MusicSearchSection />}
        {activeTab === "animeSearch" && <AnimeSearchSection />}
        {activeTab === "movieSearch" && <MovieSearchSection />}
        {activeTab === "gameSearch" && <GameSearchSection />}
        {activeTab === "settings" && <Settings/>}
      </main>
    </div>
  )
}
