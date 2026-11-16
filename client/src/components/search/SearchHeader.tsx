import type { ReactNode } from "react"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProviderAttribution } from "@/components/search/ProviderAttribution"
import { useLimits } from "@/hooks/useLimits"
import { SEARCH_PLACEHOLDER, searchOnEnter } from "@/lib/searchQuery"

interface SearchHeaderProps {
  title: string
  attribution: { href: string; text: string }
  value: string
  onChange: (value: string) => void
  onSearch: () => void
  /** Disables the search button while a search is running. */
  busy: boolean
  /** Page-specific controls (mode, filters, year…), shown after the search button. */
  children?: ReactNode
  /** Shown under the search row (e.g. applied filter chips). */
  below?: ReactNode
}

/** Title, provider attribution and the search row every search page shares. */
export function SearchHeader({ title, attribution, value, onChange, onSearch, busy, children, below }: SearchHeaderProps) {
  const limits = useLimits()
  return (
    <div className="flex flex-col gap-4 px-4 sm:px-6 pt-4 sm:pt-6 pb-4">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold">{title}</h1>
        <ProviderAttribution href={attribution.href}>{attribution.text}</ProviderAttribution>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder={SEARCH_PLACEHOLDER}
          value={value}
          maxLength={limits.search.queryMaxLength}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={searchOnEnter(onSearch)}
          className="h-10 flex-1 min-w-[12rem] rounded-full border-border-strong bg-card px-4"
        />
        <Button size="icon" variant="amber" aria-label="Search" className="h-10 w-10 rounded-full" disabled={busy} onClick={onSearch}>
          <Search />
        </Button>
        {children && <div className="basis-full sm:basis-auto flex flex-wrap items-center gap-2">{children}</div>}
      </div>
      {below}
    </div>
  )
}
