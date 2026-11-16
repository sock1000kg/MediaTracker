import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { searchOnEnter } from "@/lib/searchQuery"

const ANY = "any" // Radix Select doesn't allow an empty-string item value

const CONTROL_CLASS = "h-10 rounded-md border border-input bg-card text-sm focus:ring-2 focus:outline-none"

interface FilterSelectProps<V extends string> {
  /** Accessible name. */
  label: string
  value: V | ""
  onChange: (value: V | "") => void
  options: readonly { value: V; label: string }[]
  /** Adds a first option that clears the filter (value ""), e.g. "Any platform". */
  anyLabel?: string
}

/** A compact dropdown for a search page's header row. */
export function FilterSelect<V extends string>({ label, value, onChange, options, anyLabel }: FilterSelectProps<V>) {
  return (
    <Select value={value || ANY} onValueChange={(v) => onChange(v === ANY ? "" : (v as V))}>
      <SelectTrigger aria-label={label} className={CONTROL_CLASS}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {anyLabel && <SelectItem value={ANY}>{anyLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** The year box of the movie and TV searches; Enter runs the search. */
export function YearInput({ value, onChange, onSearch }: { value: string; onChange: (v: string) => void; onSearch: () => void }) {
  return (
    <Input
      type="number"
      inputMode="numeric"
      aria-label="Year"
      placeholder="Year"
      min={1874}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={searchOnEnter(onSearch)}
      className={`w-24 px-3 py-2 ${CONTROL_CLASS}`}
    />
  )
}
