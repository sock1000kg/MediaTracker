import { useState } from "react"
import { Filter, X } from "lucide-react"
import { searchBooks } from "@/api/search"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SearchPageShell } from "@/components/search/SearchPageShell"
import { SearchHeader } from "@/components/search/SearchHeader"
import { SearchResults } from "@/components/search/SearchResults"
import { ResultList } from "@/components/search/ResultList"
import { useHideLogged } from "@/hooks/useHideLogged"
import { useLimits } from "@/hooks/useLimits"
import { useProviderSearch } from "@/hooks/useProviderSearch"
import { useSearchLogging } from "@/hooks/useSearchLogging"
import { useStoredView } from "@/hooks/useStoredView"
import { isResultLogged } from "@/lib/utils"
import { CLIENT_PROVIDERS } from "@/lib/providers"
import type { BookResult, BookSearchFilters, BookSort } from "@/types/search"

const LANGUAGES: { value: string, label: string }[] = [
    { value: "eng", label: "English" },
    { value: "fre", label: "French" },
    { value: "ger", label: "German" },
    { value: "spa", label: "Spanish" },
    { value: "ita", label: "Italian" },
    { value: "por", label: "Portuguese" },
    { value: "rus", label: "Russian" },
    { value: "jpn", label: "Japanese" },
    { value: "chi", label: "Chinese" },
    { value: "kor", label: "Korean" },
    { value: "vie", label: "Vietnamese" },
]

const SORTS: { value: BookSort, label: string }[] = [
    { value: "relevance", label: "Relevance" },
    { value: "new", label: "Newest" },
    { value: "old", label: "Oldest" },
    { value: "rating", label: "Top rated" },
]

const ANY = "any" // Radix Select doesn't allow an empty-string item value

// Draft filters are kept as strings for the inputs; applied ones are cleaned up
function cleanFilters(f: BookSearchFilters): BookSearchFilters {
    const out: BookSearchFilters = {}
    if (f.author?.trim()) out.author = f.author.trim()
    if (f.subject?.trim()) out.subject = f.subject.trim()
    if (f.language) out.language = f.language
    if (f.yearFrom !== undefined && !Number.isNaN(f.yearFrom)) out.yearFrom = f.yearFrom
    if (f.yearTo !== undefined && !Number.isNaN(f.yearTo)) out.yearTo = f.yearTo
    if (f.sort && f.sort !== "relevance") out.sort = f.sort
    return out
}

function filterChips(f: BookSearchFilters): { key: keyof BookSearchFilters, label: string }[] {
    const chips: { key: keyof BookSearchFilters, label: string }[] = []
    if (f.author) chips.push({ key: "author", label: `Author: ${f.author}` })
    if (f.subject) chips.push({ key: "subject", label: `Subject: ${f.subject}` })
    if (f.language) chips.push({ key: "language", label: `Language: ${LANGUAGES.find(l => l.value === f.language)?.label ?? f.language}` })
    if (f.yearFrom !== undefined) chips.push({ key: "yearFrom", label: `From: ${f.yearFrom}` })
    if (f.yearTo !== undefined) chips.push({ key: "yearTo", label: `To: ${f.yearTo}` })
    if (f.sort) chips.push({ key: "sort", label: `Sort: ${SORTS.find(s => s.value === f.sort)?.label ?? f.sort}` })
    return chips
}

export default function BooksSearchSection() {
  const [inputValue, setInputValue] = useState("")
  const [query, setQuery] = useState("")

  // Filters: draft = what's in the panel, applied = what the search uses
  const [showFilters, setShowFilters] = useState(false)
  const [draftFilters, setDraftFilters] = useState<BookSearchFilters>({})
  const [appliedFilters, setAppliedFilters] = useState<BookSearchFilters>({})

  const [view, setView] = useStoredView("search.view.books")
  const [hideLogged, toggleHideLogged] = useHideLogged("books")
  const limits = useLimits()

  const search = useProviderSearch<BookResult>({
    queryKey: ["searchBooks", query, appliedFilters],
    query,
    fetchPage: (page) => searchBooks(query, page, appliedFilters),
    hideLogged,
  })
  const { openLog, dialog, entryCountFor } = useSearchLogging<BookResult>(search.logs)

  // Applies the panel's filters together with the typed query
  const handleSearch = () => {
    setAppliedFilters(cleanFilters(draftFilters))
    if (inputValue.trim()) setQuery(inputValue.trim())
  }

  const applyFilters = (next: BookSearchFilters) => {
    const cleaned = cleanFilters(next)
    setDraftFilters(cleaned)
    setAppliedFilters(cleaned)
  }

  const removeChip = (key: keyof BookSearchFilters) => {
    const next = { ...appliedFilters }
    delete next[key]
    applyFilters(next)
  }

  const chips = filterChips(appliedFilters)

  return (
    <SearchPageShell page="books">
      <SearchHeader
        title="Book search"
        attribution={CLIENT_PROVIDERS.openlibrary.attribution}
        value={inputValue}
        onChange={setInputValue}
        onSearch={handleSearch}
        busy={search.busy}
        below={chips.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center mt-1">
            <span className="text-xs font-medium text-muted-foreground">Filters:</span>
            {chips.map(chip => (
              <div key={chip.key} className="flex items-center gap-1 border rounded-full px-2.5 py-0.5 text-xs bg-tag text-tag-foreground border-tag">
                <Filter className="h-3 w-3 opacity-50" />
                <span className="font-medium">{chip.label}</span>
                <button aria-label={`Remove ${chip.label}`} onClick={() => removeChip(chip.key)} className="ml-1 hover:opacity-100 opacity-60">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <button className="text-xs text-muted-foreground hover:underline" onClick={() => applyFilters({})}>Clear all</button>
          </div>
        )}
      >
        <Button variant="outline" className="h-10 rounded-full border-border-strong bg-card" onClick={() => setShowFilters(v => !v)} aria-expanded={showFilters}>
          <Filter /> Filters
        </Button>
      </SearchHeader>

      {showFilters && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 px-4 sm:px-6 pb-4">
          <div className="grid gap-1">
            <Label htmlFor="book-filter-author">Author</Label>
            <Input id="book-filter-author" maxLength={limits.search.queryMaxLength} value={draftFilters.author ?? ""}
              onChange={(e) => setDraftFilters(f => ({ ...f, author: e.target.value }))} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="book-filter-subject">Subject</Label>
            <Input id="book-filter-subject" maxLength={limits.search.queryMaxLength} value={draftFilters.subject ?? ""}
              onChange={(e) => setDraftFilters(f => ({ ...f, subject: e.target.value }))} />
          </div>
          <div className="grid gap-1">
            <Label>Language</Label>
            <Select value={draftFilters.language ?? ANY}
              onValueChange={(v) => setDraftFilters(f => ({ ...f, language: v === ANY ? undefined : v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any</SelectItem>
                {LANGUAGES.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="book-filter-year-from">Year from</Label>
            <Input id="book-filter-year-from" type="number" min={0} max={2100} value={draftFilters.yearFrom ?? ""}
              onChange={(e) => setDraftFilters(f => ({ ...f, yearFrom: e.target.value === "" ? undefined : Number(e.target.value) }))} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="book-filter-year-to">Year to</Label>
            <Input id="book-filter-year-to" type="number" min={0} max={2100} value={draftFilters.yearTo ?? ""}
              onChange={(e) => setDraftFilters(f => ({ ...f, yearTo: e.target.value === "" ? undefined : Number(e.target.value) }))} />
          </div>
          <div className="grid gap-1">
            <Label>Sort</Label>
            <Select value={draftFilters.sort ?? "relevance"}
              onValueChange={(v) => setDraftFilters(f => ({ ...f, sort: v as BookSort }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SORTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 md:col-span-3 flex justify-end">
            <Button variant="amber" onClick={() => applyFilters(draftFilters)}>Apply</Button>
          </div>
        </div>
      )}

      <SearchResults query={query} search={search} hideLogged={hideLogged} onToggleHideLogged={toggleHideLogged} view={view} onView={setView}>
        <ResultList
          results={search.visibleResults}
          view={view}
          kindOf={() => "book"}
          isLogged={(item) => isResultLogged(search.logs, item)}
          onLog={(item) => openLog(item)}
          entryCount={(item) => entryCountFor(item)}
          onAddEntry={(item) => openLog(item, { addEntry: true })}
        />
      </SearchResults>

      {dialog}
    </SearchPageShell>
  )
}
