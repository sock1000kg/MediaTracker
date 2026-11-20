import { useState } from "react"
import { searchMovies } from "@/api/search"
import { SearchPageShell } from "@/components/search/SearchPageShell"
import { SearchHeader } from "@/components/search/SearchHeader"
import { SearchResults } from "@/components/search/SearchResults"
import { YearInput } from "@/components/search/SearchControls"
import { ResultList } from "@/components/search/ResultList"
import { useHideLogged } from "@/hooks/useHideLogged"
import { useProviderSearch } from "@/hooks/useProviderSearch"
import { useSearchLogging } from "@/hooks/useSearchLogging"
import { useStoredView } from "@/hooks/useStoredView"
import { isResultLogged } from "@/lib/utils"
import { parseYear } from "@/lib/searchQuery"
import { CLIENT_PROVIDERS } from "@/lib/providers"
import type { MovieResult } from "@/types/search"

export function MovieSearchSection() {
  const [inputValue, setInputValue] = useState("")
  const [query, setQuery] = useState("")
  const [yearInput, setYearInput] = useState("")
  const [year, setYear] = useState("")

  const [view, setView] = useStoredView("search.view.movies")
  const [hideLogged, toggleHideLogged] = useHideLogged("movies")

  const search = useProviderSearch<MovieResult>({
    queryKey: ["searchMovies", query, year],
    query,
    fetchPage: (page) => searchMovies(query, page, { year: year ? Number(year) : undefined }),
    hideLogged,
  })
  const { openLog, dialog, entryCountFor } = useSearchLogging<MovieResult>(search.logs)

  const handleSearch = () => {
    if (!inputValue.trim()) return
    setQuery(inputValue.trim())
    setYear(parseYear(yearInput))
  }

  return (
    <SearchPageShell page="movies">
      <SearchHeader
        title="Movie search"
        attribution={CLIENT_PROVIDERS.tmdb.attribution}
        value={inputValue}
        onChange={setInputValue}
        onSearch={handleSearch}
        busy={search.busy}
      >
        <YearInput value={yearInput} onChange={setYearInput} onSearch={handleSearch} />
      </SearchHeader>

      <SearchResults query={query} search={search} hideLogged={hideLogged} onToggleHideLogged={toggleHideLogged} view={view} onView={setView}>
        <ResultList
          results={search.visibleResults}
          view={view}
          kindOf={() => "movie"}
          isLogged={(item) => isResultLogged(search.logs, item)}
          onLog={(item) => openLog(item)}
          entryCount={(item) => entryCountFor(item)}
        />
      </SearchResults>

      {dialog}
    </SearchPageShell>
  )
}

export default MovieSearchSection
