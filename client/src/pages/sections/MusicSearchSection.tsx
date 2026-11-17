import { useEffect, useState } from "react"
import { searchAlbums, searchTracks } from "@/api/search"
import { SearchPageShell } from "@/components/search/SearchPageShell"
import { SearchHeader } from "@/components/search/SearchHeader"
import { SearchResults } from "@/components/search/SearchResults"
import { FilterSelect } from "@/components/search/SearchControls"
import { ResultList } from "@/components/search/ResultList"
import { AlbumItem } from "@/components/music/AlbumItem"
import { useHideLogged } from "@/hooks/useHideLogged"
import { useProviderSearch } from "@/hooks/useProviderSearch"
import { useSearchLogging } from "@/hooks/useSearchLogging"
import { useStoredView } from "@/hooks/useStoredView"
import { isResultLogged } from "@/lib/utils"
import { LASTFM_URL, LASTFM_ATTRIBUTION_TEXT, COVER_ART_ARCHIVE_URL, COVER_ART_ARCHIVE_ATTRIBUTION_TEXT } from "@/lib/musicFormat"
import type { MusicResult, MusicTrackResult } from "@/types/search"

type MusicMode = "albums" | "tracks"

const MODE_OPTIONS: { value: MusicMode; label: string }[] = [
  { value: "albums", label: "Albums" },
  { value: "tracks", label: "Tracks" },
]

export function MusicSearchSection() {
  const [inputValue, setInputValue] = useState("")
  const [query, setQuery] = useState("")
  const [searchMode, setSearchMode] = useState<MusicMode>("albums")
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!toastMessage) return
    const t = setTimeout(() => setToastMessage(null), 4000)
    return () => clearTimeout(t)
  }, [toastMessage])

  const [view, setView] = useStoredView("search.view.music")
  const [hideLogged, toggleHideLogged] = useHideLogged("music")

  const search = useProviderSearch<MusicResult>({
    queryKey: ["searchMusic", searchMode, query],
    query,
    fetchPage: (page) => (searchMode === "tracks" ? searchTracks(query, page) : searchAlbums(query, page)),
    hideLogged,
  })
  const { openLog, dialog } = useSearchLogging<MusicResult | MusicTrackResult>(search.logs, [["albumTracks"]])

  const handleSearch = () => {
    if (inputValue.trim()) setQuery(inputValue.trim())
  }

  const handleTrackMore = (track: MusicTrackResult, album: MusicResult) => {
    const existing = track.myLog ? search.logs.find((l) => l.id === track.myLog?.id) : undefined
    openLog(track, { parent: album, existing })
  }

  const albumItems = search.visibleResults.map((album) => (
    <AlbumItem
      key={album.sourceId}
      album={album}
      view={view}
      logs={search.logs}
      onLog={(item) => openLog(item)}
      onMore={handleTrackMore}
      onErrorToast={setToastMessage}
    />
  ))

  return (
    <SearchPageShell page="music">
      <SearchHeader
        title="Music search"
        attribution={{ href: LASTFM_URL, text: LASTFM_ATTRIBUTION_TEXT, also: { href: COVER_ART_ARCHIVE_URL, text: COVER_ART_ARCHIVE_ATTRIBUTION_TEXT } }}
        value={inputValue}
        onChange={setInputValue}
        onSearch={handleSearch}
        busy={search.busy}
      >
        <FilterSelect label="Albums or tracks" value={searchMode} onChange={(v) => setSearchMode(v || "albums")} options={MODE_OPTIONS} />
      </SearchHeader>

      <SearchResults query={query} search={search} hideLogged={hideLogged} onToggleHideLogged={toggleHideLogged} view={view} onView={setView}>
        {searchMode === "albums" ? (
          view === "grid" ? (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-5 gap-y-7">
              {albumItems}
            </ul>
          ) : (
            <ul className="flex flex-col gap-3">{albumItems}</ul>
          )
        ) : (
          <ResultList
            results={search.visibleResults}
            view={view}
            kindOf={() => "music"}
            isLogged={(item) => isResultLogged(search.logs, item)}
            onLog={(item) => openLog(item)}
          />
        )}
      </SearchResults>

      {toastMessage && (
        <div
          role="alert"
          className="fixed bottom-4 right-4 z-50 rounded-lg border border-destructive/20 bg-card px-4 py-2.5 text-sm text-destructive shadow-lg flex items-center gap-2"
        >
          <span>{toastMessage}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setToastMessage(null)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
      )}

      {dialog}
    </SearchPageShell>
  )
}

export default MusicSearchSection
