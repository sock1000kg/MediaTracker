import { useState } from "react"
import { searchGames } from "@/api/search"
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
import { RAWG_URL, RAWG_ATTRIBUTION_TEXT } from "@/lib/gameFormat"
import type { GamePlatform, GameResult, GameSort } from "@/types/search"

const PLATFORM_OPTIONS: { value: GamePlatform; label: string }[] = [
  { value: "pc", label: "PC" }, { value: "playstation", label: "PlayStation" }, { value: "xbox", label: "Xbox" },
  { value: "nintendo", label: "Nintendo" }, { value: "ios", label: "iOS" }, { value: "android", label: "Android" },
  { value: "mac", label: "Mac" }, { value: "linux", label: "Linux" },
]

const SORT_OPTIONS: { value: GameSort; label: string }[] = [
  { value: "relevance", label: "Relevance" }, { value: "rating", label: "Top rated" },
  { value: "newest", label: "Newest" }, { value: "metacritic", label: "Metacritic" },
]

export function GameSearchSection() {
  const [inputValue, setInputValue] = useState("")
  const [query, setQuery] = useState("")
  const [platform, setPlatform] = useState<GamePlatform | "">("")
  const [sort, setSort] = useState<GameSort>("relevance")

  const [view, setView] = useStoredView("search.view.games")
  const [hideLogged, toggleHideLogged] = useHideLogged("games")

  const search = useProviderSearch<GameResult>({
    queryKey: ["searchGames", query, platform, sort],
    query,
    fetchPage: (page) => searchGames(query, page, { platform: platform || undefined, sort }),
    hideLogged,
  })
  const { openLog, dialog } = useSearchLogging<GameResult>(search.logs)

  const handleSearch = () => {
    if (inputValue.trim()) setQuery(inputValue.trim())
  }

  return (
    <SearchPageShell page="games">
      <SearchHeader
        title="Game search"
        attribution={{ href: RAWG_URL, text: RAWG_ATTRIBUTION_TEXT }}
        value={inputValue}
        onChange={setInputValue}
        onSearch={handleSearch}
        busy={search.busy}
      >
        <FilterSelect label="Platform" value={platform} onChange={setPlatform} options={PLATFORM_OPTIONS} anyLabel="Any platform" />
        <FilterSelect label="Sort" value={sort} onChange={(v) => setSort(v || "relevance")} options={SORT_OPTIONS} />
      </SearchHeader>

      <SearchResults query={query} search={search} hideLogged={hideLogged} onToggleHideLogged={toggleHideLogged} view={view} onView={setView}>
        <ResultList
          results={search.visibleResults}
          view={view}
          kindOf={() => "game"}
          isLogged={(item) => isResultLogged(search.logs, item)}
          onLog={(item) => openLog(item)}
        />
      </SearchResults>

      {dialog}
    </SearchPageShell>
  )
}

export default GameSearchSection
