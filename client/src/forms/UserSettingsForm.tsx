import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useIsMutating, useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query"

import BlueDude from "@/components/BlueDude"
import { useLogsBackdrop } from "@/hooks/useLogsBackdrop"
import { writeLogsBackdrop } from "@/lib/logsBackdrop"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

import { changePassword, deleteAccount, exportData, updateProfile, type ExportFormat } from "@/api/user"
import { fetchMeQueryOptions } from "@/queryOptions/fetchMeQueryOptions"
import { PREFS_MUTATION_KEY, usePreferences } from "@/hooks/usePreferences"
import { effectiveHideLogged } from "@/lib/preferences"
import { readStoredBool, writeStoredBool } from "@/lib/utils"
import { useThemePref } from "@/hooks/useThemePref"
import { pickLoadingLine } from "@/lib/whimsy"
import { passwordProblems } from "@/lib/passwordRules"
import type { ThemePref } from "@/lib/theme"
import { AVAILABLE_SORT_FIELDS_LOGS, AVAILABLE_SORT_FIELDS_MEDIAS, type SortDirection, type SortField } from "@/types/sort"
import type { SortPref, StartTab, UserProfile } from "@/types/user"

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong")

const NONE = "none"

const THEME_LABELS: { value: ThemePref; label: string }[] = [
  { value: "light", label: "Daylight" },
  { value: "dark", label: "Lamplight" },
  { value: "system", label: "Follow the window" },
]

const TAB_LABELS: { value: StartTab; label: string }[] = [
  { value: "logs", label: "Logs" },
  { value: "medias", label: "Medias" },
  { value: "mediaTypes", label: "Media Types" },
  { value: "bookSearch", label: "Book search" },
  { value: "musicSearch", label: "Music search" },
  { value: "animeSearch", label: "Anime & manga search" },
  { value: "movieSearch", label: "Movie search" },
  { value: "gameSearch", label: "Game search" },
  { value: "settings", label: "Settings" },
]

const DEMO_NOTICE =
  "You're on the shared demo account, so profile, password and account deletion are turned off. Preferences and export still work."
const DEMO_OFF = "Turned off on the demo account."

/** Heading plus one plain line; used instead of the form on the demo account (no greyed-out inputs). */
function DemoOffSection({ title }: { title: string }) {
  return (
    <Section title={title}>
      <p className="text-sm text-foreground">{DEMO_OFF}</p>
    </Section>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function FieldError({ id, message }: { id: string; message?: string | null }) {
  if (!message) return null
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {message}
    </p>
  )
}

/** A polite live region that stays mounted so announcements are picked up. */
function Status({ message, className = "text-link" }: { message: string | null; className?: string }) {
  return (
    <p role="status" aria-live="polite" className={`min-h-5 text-sm ${className}`}>
      {message}
    </p>
  )
}

function useFlash(ms = 3000) {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const flash = (m: string) => {
    setMessage(m)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMessage(null), ms)
  }
  return [message, flash] as const
}

/* ---------------------------------- Profile --------------------------------- */

function ProfileSection({ me }: { me: UserProfile }) {
  const queryClient = useQueryClient()
  const [displayName, setDisplayName] = useState(me.displayName)
  const [error, setError] = useState<string | null>(null)
  const [saved, flashSaved] = useFlash()

  const mutation = useMutation({
    mutationFn: (name: string) => updateProfile(name),
    onSuccess: (profile) => {
      queryClient.setQueryData<UserProfile | undefined>(["me"], (old) =>
        old ? { ...old, displayName: profile.displayName ?? displayName.trim() } : old
      )
      flashSaved("Saved")
    },
    onError: (e) => setError(errMsg(e)),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const trimmed = displayName.trim()
    if (trimmed.length < 3 || trimmed.length > 50) {
      setError("Display name must be 3–50 characters")
      return
    }
    mutation.mutate(trimmed)
  }

  return (
    <Section title="Profile">
      <form onSubmit={submit} className="space-y-3 max-w-sm">
        <div className="space-y-1">
          <Label htmlFor="profile-username">Username</Label>
          <p id="profile-username" className="text-sm text-muted-foreground">{me.username}</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="profile-display-name">Display name</Label>
          <Input
            id="profile-display-name"
            value={displayName}
            aria-invalid={!!error}
            aria-describedby={error ? "profile-display-name-error" : undefined}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <FieldError id="profile-display-name-error" message={error} />
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" variant="amber" size="sm" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : "Save"}
          </Button>
          <Status message={saved} />
        </div>
      </form>
    </Section>
  )
}

/* --------------------------------- Password --------------------------------- */

function PasswordSection() {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [currentError, setCurrentError] = useState<string | null>(null)
  const [nextError, setNextError] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [done, flashDone] = useFlash(6000)

  const mutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      setCurrent("")
      setNext("")
      setConfirm("")
      flashDone("Password changed. Other devices were signed out.")
    },
  })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setCurrentError(null)
    setNextError(null)
    setConfirmError(null)
    setFormError(null)
    const problems = passwordProblems(next)
    if (problems.length > 0) {
      setNextError(`New password needs ${problems.join(", ")}`)
      return
    }
    if (next !== confirm) {
      setConfirmError("Passwords don't match")
      return
    }
    try {
      await mutation.mutateAsync({ currentPassword: current, newPassword: next })
    } catch (err) {
      const msg = errMsg(err)
      // The server answers 403 for a wrong current password; apiFetch only keeps the message
      if (/^Current password is incorrect/i.test(msg)) setCurrentError("Current password is incorrect")
      else setFormError(msg)
    }
  }

  return (
    <Section title="Password">
      <form onSubmit={submit} className="space-y-3 max-w-sm">
        <div className="space-y-1">
          <Label htmlFor="pw-current">Current password</Label>
          <Input
            id="pw-current"
            type="password"
            autoComplete="current-password"
            value={current}
            aria-invalid={!!currentError}
            aria-describedby={currentError ? "pw-current-error" : undefined}
            onChange={(e) => setCurrent(e.target.value)}
          />
          <FieldError id="pw-current-error" message={currentError} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pw-new">New password</Label>
          <Input
            id="pw-new"
            type="password"
            autoComplete="new-password"
            value={next}
            aria-invalid={!!nextError}
            aria-describedby={nextError ? "pw-new-help pw-new-error" : "pw-new-help"}
            onChange={(e) => setNext(e.target.value)}
          />
          <p id="pw-new-help" className="text-xs text-muted-foreground">
            8+ characters with an uppercase letter, a lowercase letter, a number and a special character.
          </p>
          <FieldError id="pw-new-error" message={nextError} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pw-confirm">Confirm new password</Label>
          <Input
            id="pw-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            aria-invalid={!!confirmError}
            aria-describedby={confirmError ? "pw-confirm-error" : undefined}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <FieldError id="pw-confirm-error" message={confirmError} />
        </div>
        <FieldError id="pw-form-error" message={formError} />
        <div className="flex items-center gap-3">
          <Button
            type="submit"
            variant="amber"
            size="sm"
            disabled={mutation.isPending || !current || !next || !confirm}
          >
            {mutation.isPending ? "Changing..." : "Change password"}
          </Button>
          <Status message={done} />
        </div>
      </form>
    </Section>
  )
}

/* -------------------------------- Preferences ------------------------------- */

function SortRow({
  label,
  idPrefix,
  fields,
  value,
  onChange,
}: {
  label: string
  idPrefix: string
  fields: { label: string; value: SortField }[]
  value: SortPref | undefined
  onChange: (next: SortPref[]) => void
}) {
  const direction: SortDirection = value?.direction ?? "asc"
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-field`}>{label}</Label>
        <Select
          value={value?.field ?? NONE}
          onValueChange={(v) => onChange(v === NONE ? [] : [{ field: v as SortField, direction }])}
        >
          <SelectTrigger id={`${idPrefix}-field`} className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>None</SelectItem>
            {fields.map((f) => (
              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-dir`}>Direction</Label>
        <Select
          value={direction}
          disabled={!value}
          onValueChange={(v) => value && onChange([{ field: value.field, direction: v as SortDirection }])}
        >
          <SelectTrigger id={`${idPrefix}-dir`} className="w-36" aria-label={`${label} direction`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="asc">Ascending</SelectItem>
            <SelectItem value="desc">Descending</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function PreferencesSection() {
  const { prefs, updatePrefs } = usePreferences()
  // Shared across every instance that saves preferences (this form, the sidebar toggle, the theme select)
  const isSaving = useIsMutating({ mutationKey: PREFS_MUTATION_KEY }) > 0
  const latest = useMutationState({
    filters: { mutationKey: PREFS_MUTATION_KEY },
    select: (m) => ({ status: m.state.status, submittedAt: m.state.submittedAt }),
  }).reduce<{ status: string; submittedAt: number } | null>(
    (acc, m) => (!acc || m.submittedAt >= acc.submittedAt ? m : acc),
    null
  )
  const saveError = latest?.status === "error"
  const [localHide, setLocalHide] = useState({
    books: readStoredBool("hideLogged.books"),
    music: readStoredBool("hideLogged.music"),
    anime: readStoredBool("hideLogged.anime"),
    movies: readStoredBool("hideLogged.movies"),
    games: readStoredBool("hideLogged.games"),
  })
  const hideValue = (k: "books" | "music" | "anime" | "movies" | "games") => effectiveHideLogged(prefs.hideLogged?.[k], localHide[k])
  const setHide = (k: "books" | "music" | "anime" | "movies" | "games", next: boolean) => {
    writeStoredBool(`hideLogged.${k}`, next)
    setLocalHide((p) => ({ ...p, [k]: next }))
    updatePrefs({ hideLogged: { [k]: next } })
  }
  const logsBackdrop = useLogsBackdrop()
  const { pref: theme, setPref: setTheme } = useThemePref()
  const [saved, flashSaved] = useFlash(2000)
  const [pending, setPending] = useState(false)

  // Show "Saved" after a save finishes without error
  useEffect(() => {
    if (isSaving) setPending(true)
    else if (pending) {
      setPending(false)
      if (!saveError) flashSaved("Saved")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSaving])

  return (
    <Section title="Preferences">
      <div className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="pref-theme">Theme</Label>
          <Select value={theme} onValueChange={(v) => setTheme(v as ThemePref)}>
            <SelectTrigger id="pref-theme" className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {THEME_LABELS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="pref-tab">Start on</Label>
          <Select
            value={prefs.defaultTab ?? NONE}
            onValueChange={(v) => updatePrefs({ defaultTab: v === NONE ? null : (v as StartTab) })}
          >
            <SelectTrigger id="pref-tab" className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No preference</SelectItem>
              {TAB_LABELS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="pref-logs-backdrop">Page backdrops (the giant blue dude)</Label>
          <Select value={logsBackdrop ? "on" : "off"} onValueChange={(v) => writeLogsBackdrop(v === "on")}>
            <SelectTrigger id="pref-logs-backdrop" className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="on">On</SelectItem>
              <SelectItem value="off">Off</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">A giant, faint picture behind your logs and search pages. Saved on this device only.</p>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Hide logged results</legend>
          <div className="flex items-center gap-2">
            <input
              id="pref-hide-books"
              type="checkbox"
              className="size-4 accent-primary"
              checked={hideValue("books")}
              onChange={(e) => setHide("books", e.target.checked)}
            />
            <Label htmlFor="pref-hide-books">Books</Label>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="pref-hide-music"
              type="checkbox"
              className="size-4 accent-primary"
              checked={hideValue("music")}
              onChange={(e) => setHide("music", e.target.checked)}
            />
            <Label htmlFor="pref-hide-music">Music</Label>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="pref-hide-anime"
              type="checkbox"
              className="size-4 accent-primary"
              checked={hideValue("anime")}
              onChange={(e) => setHide("anime", e.target.checked)}
            />
            <Label htmlFor="pref-hide-anime">Anime &amp; manga</Label>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="pref-hide-movies"
              type="checkbox"
              className="size-4 accent-primary"
              checked={hideValue("movies")}
              onChange={(e) => setHide("movies", e.target.checked)}
            />
            <Label htmlFor="pref-hide-movies">Movies</Label>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="pref-hide-games"
              type="checkbox"
              className="size-4 accent-primary"
              checked={hideValue("games")}
              onChange={(e) => setHide("games", e.target.checked)}
            />
            <Label htmlFor="pref-hide-games">Games</Label>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Default sort</legend>
          <SortRow
            label="Logs"
            idPrefix="pref-sort-logs"
            fields={AVAILABLE_SORT_FIELDS_LOGS}
            value={prefs.defaultSort?.logs?.[0]}
            onChange={(next) => updatePrefs({ defaultSort: { logs: next } })}
          />
          <SortRow
            label="Medias"
            idPrefix="pref-sort-medias"
            fields={AVAILABLE_SORT_FIELDS_MEDIAS}
            value={prefs.defaultSort?.medias?.[0]}
            onChange={(next) => updatePrefs({ defaultSort: { medias: next } })}
          />
          <p className="text-xs text-muted-foreground">"None" keeps the built-in order (newest first).</p>
        </fieldset>

        <Status message={saveError ? "Couldn't save that change" : saved} className={saveError ? "text-destructive" : "text-link"} />
      </div>
    </Section>
  )
}

/* ---------------------------------- Export ---------------------------------- */

function ExportSection() {
  const [busy, setBusy] = useState<ExportFormat | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (format: ExportFormat) => {
    setBusy(format)
    setError(null)
    try {
      await exportData(format)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Section title="Your data">
      <div className="flex gap-3">
        <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => run("json")}>
          {busy === "json" ? "Downloading..." : "Export as JSON"}
        </Button>
        <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => run("csv")}>
          {busy === "csv" ? "Downloading..." : "Export as CSV"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Your logs, media and media types. API keys aren't included.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </Section>
  )
}

/* ---------------------------------- Delete ---------------------------------- */

function DeleteSection({ username }: { username: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState("")
  const [confirmUsername, setConfirmUsername] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setPassword("")
    setConfirmUsername("")
    setError(null)
    setBusy(false)
  }

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      await deleteAccount({ password, confirmUsername })
      try {
        localStorage.removeItem("accessToken")
      } catch {
        // storage unavailable
      }
      queryClient.clear()
      navigate("/login")
    } catch (e) {
      setError(errMsg(e))
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-semibold">Delete account</h2>
      <p className="text-sm text-muted-foreground">
        Permanently deletes your account and everything in it: logs, media, media types and API keys. This can't be undone.
      </p>
      <Button
        variant="outline"
        size="sm"
        className="text-destructive border-destructive"
        onClick={() => { reset(); setOpen(true) }}
      >
        Delete account…
      </Button>

      <AlertDialog open={open} onOpenChange={(o) => { if (!busy) { setOpen(o); if (!o) reset() } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-2">
              <BlueDude size={32} mood="lookAway" />
              <AlertDialogTitle className="font-display font-semibold">Delete your account?</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              This removes your account and all your data for good.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="delete-password">Password</Label>
              <Input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="delete-username">Type your username to confirm</Label>
              <Input
                id="delete-username"
                autoComplete="off"
                value={confirmUsername}
                aria-describedby="delete-hint"
                onChange={(e) => setConfirmUsername(e.target.value)}
              />
              <p id="delete-hint" className="text-xs text-muted-foreground">Enter “{username}” exactly.</p>
            </div>
            <FieldError id="delete-error" message={error} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button
              size="sm"
              variant="destructive"
              disabled={busy || !password || confirmUsername !== username}
              onClick={confirm}
            >
              {busy ? "..." : "Delete account"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

/* ----------------------------------- Form ----------------------------------- */

export function UserSettingsForm() {
  const [loadingLine] = useState(() => pickLoadingLine())
  const { data: me, error, isPending, refetch, isFetching } = useQuery(fetchMeQueryOptions())

  if (isPending) return <p className="text-muted-foreground animate-pulse">{loadingLine}</p>

  if (error || !me) {
    return (
      <div className="space-y-2">
        <p role="alert" className="text-sm text-destructive">{error?.message ?? "Couldn't load your account"}</p>
        <Button variant="outline" size="sm" disabled={isFetching} onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  const isDemo = me.username === "demo"

  return (
    <div className="px-4 space-y-8 pb-8">
      {isDemo && (
        <div role="note" className="bg-tag text-tag-foreground rounded-md p-3 text-sm">{DEMO_NOTICE}</div>
      )}
      {isDemo ? <DemoOffSection title="Profile" /> : <ProfileSection me={me} />}
      {isDemo ? <DemoOffSection title="Password" /> : <PasswordSection />}
      <PreferencesSection />
      <ExportSection />
      <Separator />
      {isDemo ? <DemoOffSection title="Delete account" /> : <DeleteSection username={me.username} />}
    </div>
  )
}
