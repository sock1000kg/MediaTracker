import { useState } from "react"
import { searchAnime } from "@/api/search"
import { SearchPageShell } from "@/components/search/SearchPageShell"
import { SearchHeader } from "@/components/search/SearchHeader"
import { SearchResults } from "@/components/search/SearchResults"
import { FilterSelect } from "@/components/search/SearchControls"
import { ResultList } from "@/components/search/ResultList"
import { useHideLogged } from "@/hooks/useHideLogged"
import { useProviderSearch } from "@/hooks/useProviderSearch"
import { useSearchLogging } from "@/hooks/useSearchLogging"
import { useStoredView } from "@/hooks/useStoredView"
import { isResultLogged } from "@/lib/utils"
import { ANILIST_ATTRIBUTION_TEXT, ANILIST_URL, ANIME_SORT_OPTIONS, ANIME_TYPE_OPTIONS } from "@/lib/animeFormat"
import type { AnimeKind, AnimeResult, AnimeSort } from "@/types/search"

const MODE_OPTIONS: { value: AnimeKind; label: string }[] = [
  { value: "anime", label: "Anime" },
  { value: "manga", label: "Manga" },
]

export function AnimeSearchSection() {
  const [inputValue, setInputValue] = useState("")
  const [query, setQuery] = useState("")
  const [searchMode, setSearchMode] = useState<AnimeKind>("anime")
  const [type, setType] = useState("")
  const [sort, setSort] = useState<AnimeSort>("relevance")

  const [view, setView] = useStoredView("search.view.anime")
  const [hideLogged, toggleHideLogged] = useHideLogged("anime")

  const search = useProviderSearch<AnimeResult>({
    queryKey: ["searchAnime", searchMode, query, type, sort],
    query,
    fetchPage: (page) => searchAnime(query, page, { type: type || undefined, sort: sort === "relevance" ? undefined : sort }, searchMode),
    hideLogged,
  })
  const { openLog, dialog } = useSearchLogging<AnimeResult>(search.logs)

  const handleSearch = () => {
    if (inputValue.trim()) setQuery(inputValue.trim())
  }

  const changeMode = (mode: AnimeKind | "") => {
    setSearchMode(mode || "anime")
    setType("")
    setSort("relevance")
  }

  return (
    <SearchPageShell page="anime">
      <SearchHeader
        title="Anime & manga search"
        attribution={{ href: ANILIST_URL, text: ANILIST_ATTRIBUTION_TEXT }}
        value={inputValue}
        onChange={setInputValue}
        onSearch={handleSearch}
        busy={search.busy}
      >
        <FilterSelect label="Anime or manga" value={searchMode} onChange={changeMode} options={MODE_OPTIONS} />
        <FilterSelect label="Type" value={type} onChange={setType} options={ANIME_TYPE_OPTIONS[searchMode]} anyLabel="Any type" />
        <FilterSelect label="Sort" value={sort} onChange={(v) => setSort(v || "relevance")} options={ANIME_SORT_OPTIONS} />
      </SearchHeader>

      <SearchResults query={query} search={search} hideLogged={hideLogged} onToggleHideLogged={toggleHideLogged} view={view} onView={setView}>
        <ResultList
          results={search.visibleResults}
          view={view}
          kindOf={(item) => item.metadata.kind}
          isLogged={(item) => isResultLogged(search.logs, item)}
          onLog={(item) => openLog(item)}
        />
      </SearchResults>

      {dialog}
    </SearchPageShell>
  )
}

export default AnimeSearchSection
