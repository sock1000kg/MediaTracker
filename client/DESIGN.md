# MediaTracker: design direction

> A quiet place to keep track of what you've read, watched, played and listened to.
> Warm paper by day, lamplight by night, and a small blue guy who lives in the sidebar and has opinions.

This document started as the spec for the reskin (§1–§11) and has grown a section per task since (§12 on). **When a later section disagrees with an earlier one, the later section wins.** §0 is a short map of how the app looks today.

---

## 0. The app today (current state, 2026-11)

- **Shell:** left sidebar at ≥ 1024px, top bar + sheet below (§12). Sidebar dude, theme toggle, logout at the bottom.
- **Pages:** Logs (§13), Your media (§13a), Collections (§15), Media types, Stats (§14), Settings, and six searches: Books, Music, Anime & manga, Movies, TV, Games with Video and Board game modes (§13a, §17, §18).
- **Logged out:** the landing page (§16), then Login / Register.
- **Type scale:** `html { font-size: 100% }` (was 120%). Page titles `text-3xl sm:text-4xl`, page padding `px-4 sm:px-6`, controls `h-8`–`h-10`.
- **Copy lives in code:** dude lines, empty-state and loading lines are in `src/lib/whimsy.ts`. The tables in §5 describe intent; the file is the source of truth.

---

## 1. The feeling

**Like:** a reading room in the afternoon, a library card with a date stamp on it, a notebook margin, a record shop's back room, someone who leaves small notes in places you'll find later.

**Not like:**
- An artist's portfolio: no huge serif hero text, no full-bleed imagery, no "look at me" layouts.
- Startup SaaS: no gradients, no glassmorphism, no indigo, no purple-to-pink.
- Cutesy-flat "whimsy": no rainbow pastel blocks, no bouncy springs everywhere, no confetti, no emoji used as icons.

**What whimsy means here:** small, sincere-silly details that reward attention and never get in the way. The joke is never the UI itself. It's something that happens *in the corner*: the mascot blinks, he notices you hovering, he tells you to go to bed at 3am. You could use the app for a week and only find half of it. That's the point.

### Principles
1. **Quiet first.** Low contrast between surfaces, high contrast for text. One warm accent. Nothing moves unless you caused it, except the mascot's blink.
2. **Paper and ink.** Surfaces feel like paper, text like ink, tags like paper tags, dates like a library stamp.
3. **Whimsy lives at the edges:** in empty states, loading text, the sidebar mascot and dialog copy. It never shows up in data, buttons or form labels.
4. **Both themes are designed together.** Dark mode is "lamplight": warm charcoal with amber glow, not a blue-black inversion.
5. **Minimal structural change.** If a change needs a new layout, it's out of scope for this redesign.

---

## 2. Colour

All colours are defined once as CSS variables in `src/index.css`. The existing shadcn variable names stay the same, so `components/ui/*` pick up the new palette without edits. A few new tokens are added (marked **new**).

Contrast ratios were checked against WCAG 2.x. Body text is at least 4.5:1 everywhere, and control borders are at least 3:1.

### Light: "Daylight paper"

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `--background` | `#f4efe6` | page (old `bg-stone-100`) | n/a |
| `--card` / `--popover` | `#fbf8f2` | cards, dialogs, menus | n/a |
| `--sidebar` | `#ebe3d5` | right nav column (old `bg-stone-300`) | n/a |
| `--secondary` / `--muted` | `#ebe3d5` | section header strips (old `bg-stone-200`), hover fills | n/a |
| `--foreground` | `#2b2520` | ink: titles and body | 13.2:1 on bg, 14.3:1 on card |
| `--muted-foreground` | `#6b5f55` | creator, year, metadata, subtitles | 5.4 bg / 5.8 card / 4.9 sidebar |
| `--border` | `#ddd2c2` | card edges, dividers (decorative) | n/a |
| `--border-strong` **new** | `#968777` | input and outline-button borders | 3.3 card / 3.0 bg |
| `--input` | `#968777` | same as border-strong | n/a |
| `--primary` | `#a8481f` | terracotta: primary buttons ("+ Log", "Save", "Sign in") | n/a |
| `--primary-foreground` | `#fff8f0` | text on primary | 5.5:1 |
| `--ring` | `#a8481f` | focus ring (at 50% alpha, 3px, as shadcn does now) | n/a |
| `--link` **new** | `#23707f` | links ("More info", "View on Open Library"), active sort chip | 5.4 card / 5.0 bg (**don't use on sidebar**: 4.46) |
| `--tag` **new** | `#f1e4cc` | category / status badge fill (old `bg-amber-100`) | n/a |
| `--tag-foreground` **new** | `#7a4a12` | badge text (old `text-amber-800`) | 5.9:1 |
| `--destructive` | `#b3261e` | delete buttons, errors | white on it 6.5:1, on card 6.2:1 |
| `--dude` **new** | `#29c7df` | mascot body. **Decorative only**, never text (1.8:1) | n/a |
| `--dude-shade` **new** | `#327d8d` | mascot shading | n/a |

### Dark: "Lamplight"

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `--background` | `#1d1916` | page | n/a |
| `--card` / `--popover` | `#26211d` | cards, dialogs | n/a |
| `--sidebar` | `#171411` | nav column (darker than the page, like the far side of the room) | n/a |
| `--secondary` / `--muted` | `#2e2823` | header strips, hover fills | n/a |
| `--foreground` | `#ece3d6` | text | 13.7 bg / 12.5 card |
| `--muted-foreground` | `#a89a8b` | secondary text | 6.4 bg / 5.8 card / 6.7 sidebar |
| `--border` | `#3a332d` | dividers (decorative) | n/a |
| `--border-strong` / `--input` | `#7a6d62` | input borders | 3.2 card / 3.5 bg |
| `--primary` | `#e08a5a` | lamp-amber buttons | n/a |
| `--primary-foreground` | `#1d1916` | text on primary | 6.6:1 |
| `--ring` | `#e08a5a` | focus | n/a |
| `--link` | `#5fc9d9` | links | 8.2 card / 9.5 sidebar |
| `--tag` | `#3a2e20` | badge fill | n/a |
| `--tag-foreground` | `#e8c48f` | badge text | 8.0:1 |
| `--destructive` | `#ef7a6d` | delete and errors (use dark text `#1d1916` on filled buttons, 6.4:1) | 5.8 on card |
| `--dude` / `--dude-shade` | `#29c7df` / `#327d8d` | mascot: same in both themes. He doesn't change for the dark | n/a |

### Texture (the "paper")
- **Light:** a very faint grain on `body`. It's an inline SVG `feTurbulence` noise as a `background-image` data URI, at about 3–4% opacity, blended `multiply`. No image files.
- **Dark:** the same grain at about 2%, plus one soft radial "lamp glow" in the top-left of the content area: `radial-gradient(60rem 40rem at 0% 0%, rgb(224 138 90 / 0.06), transparent 70%)`. It should be barely noticeable. If you notice it on first look, it's too strong.
- Cards don't get the grain, so it reads as paper on a desk, not textured cards.

### Chart tokens
`--chart-1..5` are unused right now. Set them to the warm palette (terracotta, teal ink, ochre `#b8862b`, moss `#6b7d4a`, plum-brown `#7d4f5a`) so future charts match. Don't spend time on these.

---

## 3. Typography

Loaded from Google Fonts with a `<link>` in `index.html` (`display=swap`), with preconnects.

| Role | Family | Where | Notes |
|---|---|---|---|
| **Display** | **Fraunces** (variable; `opsz`, `SOFT 50`, `WONK 1`) | section titles ("Your Logs"), media-type group headings, dialog titles, the login card title | The "wonky" axis gives the slightly crooked, hand-set feel. Weight 500–600. Never for body text. |
| **Body / UI** | **Figtree** 400/500/600 | everything else: card titles (600), metadata, buttons, inputs | Friendly but plain. Media titles stay in Figtree so lists stay readable. |
| **Marginalia** | **Caveat** 500 | **only** the mascot's thought on the login page, the line in the delete dialog, and the landing page's aside (§16). Page headers no longer carry a handwritten subtitle (removed in Direction A, task 14) | Rotated, coloured `--muted-foreground`. At most one per screen. |
| **Pixel** | **Silkscreen** 400 | **only** inside the mascot's speech bubble | Uppercase, small (0.65rem). It ties the mascot to the UI. |

- `html { font-size: 100% }` (it was 120% until the "smaller type" pass; see §0).
- Tailwind v4: add `--font-display`, `--font-sans`, `--font-hand` and `--font-pixel` in `@theme inline` so `font-display`, `font-hand` and `font-pixel` utilities exist. `--font-sans` becomes Figtree, so the default changes everywhere with no class edits.
- Use tabular numbers (`tabular-nums`) for ratings, page counts and dates.

---

## 4. The blue lil dude

The logo stays: `src/assets/blue_stand_down.png`, a 16×16 pixel sprite. It's still the favicon. In the UI it becomes an **inline SVG component** (`src/components/BlueDude.tsx`) generated from its pixel grid, so it can blink, glance and hop without new art.

The pixel grid, decoded from the PNG (`.` transparent, `A` `#000000` outline, `B` `#29c7df` body, `C` `#327d8d` shade):

```
...AAAAAAAAAA...
.AAABBBBBBBBAAA.
AACBBBBBBBBBBBAA
ACCBBBBBBBBBBBBA
ACBBBBBBBBBBBBBA
ACBBBABBBBABBBBA   <- eyes: row 5, cols 5 and 10
ACBBBBBBBBBBBBBA
ACBBAAAAAAAABBBA   <- the grin: row 7, cols 4–11
ACCABBBBBBBBABBA
ACCBBBBBBBBBBBCA
ACCCCCCAACCCCCCA
AACCCCAAAACCCCAA
.ACBBBA..ACBBBA.
.ACCBBA..ACCBBA.
.AACCAA..AACCAA.
..AAAA....AAAA..
```

### Component rules
- `viewBox="0 0 16 16"`, one `<rect>` per pixel (or merged runs), `shape-rendering="crispEdges"`. Fill with `var(--dude)`, `var(--dude-shade)` and `#000`, with the outline drawn in `#000` in both themes. In dark mode add a 1px `--border` drop shadow (`filter: drop-shadow(0 0 0.5px #ece3d6)`) so the black outline doesn't vanish.
- Render only at **integer multiples** of 16 (32, 48, 64, 96px). Never 40px.
- **Eyes are their own `<rect>`s** so they can move:
  - **Blink:** the eye rects turn body-coloured for 120ms. Wait a random 4–11s between blinks, and do a double blink one time in eight.
  - **Glance:** eyes shift by 1 pixel (up, left or right) toward whatever you're hovering in the sidebar, and come back 1s after you stop.
  - **Asleep:** eyes become a 2-pixel horizontal line (cols 4–5 and 10–11, row 5).
- `aria-hidden="true"` everywhere except where he *is* the content (the login page: `role="img" aria-label="A small blue creature, grinning"`).
- Use `PNG` for the favicon only. The app header has no logo today, so don't add a header.

### Where he lives
1. **Sidebar** (32px in the logo row, 48px dude in the footer), the left column since Direction A (§12). This is his home.
2. **Empty states** (64px) with a speech bubble.
3. **Login / Register** (96px), standing on top of the card's top edge, as if he's peeking over it.
4. **Delete confirm dialog** (32px, next to the title), with eyes looking away.
5. **Page backdrops** (§5.9): one giant, still, faint dude behind Logs and the search pages.
6. **Landing page** (§16): the only place he is the centrepiece, holding the two buttons.

Nowhere else. He's a guest, not wallpaper (the landing page is his house, so it doesn't count).

### The envelope (sealed letters)
While a letter is ready to open, the sidebar dude holds a small envelope, drawn like him: an 11×8 pixel grid (`components/letters/PixelEnvelope.tsx`) as inline SVG, `crispEdges`, at the same integer pixel size as his (2px at 32), overlapping his lower right. Outline `#000`, paper `#efe6d6`, seal `--wax`. No animation of its own.

---

## 5. Whimsy catalogue

Every item here is cheap: CSS, copy, or a few lines of state. They're numbered so they can be built or cut one at a time. **None of them is required for the reskin to be done**, apart from 5.1 and 5.2.

### 5.1 Sidebar dude (required)
- Blinks (see §4). Glances down toward the hovered nav item (the nav sits below him in the left sidebar).
- **Click him:** he hops. That's `translateY(-4px)` and back with `steps(2)` over 240ms, which looks pixel-y and not springy. A pixel speech bubble then shows one line for 3s. Lines rotate in order, not at random, so repeat clickers see them all:
  - "hi."
  - "i'm keeping track too."
  - "that one was good. probably."
  - "i don't have hands. i can't hold a book."
  - "please stop."
  - "ok i lied, keep going."
  - "fun fact: i'm 256 pixels. some of them are see-through."
  - "…"
- **After 12 clicks in one session:** he says "ok that's enough" and falls asleep (sleep eyes) for 60s. Clicking him while he's asleep does nothing. That's the joke.
- **Late night** (local time 01:00–04:59): the first time the app loads in that window each session, the bubble says "it's late. one more chapter?" without being clicked.

- **A letter is ready** (once per session): "a letter just unsealed!" for 5s, and while he holds the envelope a click opens the letters list (no hop, no poke line, even if he was asleep).

### 5.2 Theme toggle (required)
Under the dude: a small ghost button with lucide `Sun`/`Moon` and the label **"Daylight" / "Lamplight"**. Cycles light → dark → system. "System" shows as "Follow the window" with a `Monitor` icon. When switching to dark, the dude blinks once, slowly (400ms).

### 5.3 Date stamp (retired in task 15)
The rotated `.stamp` pill is gone. The Logs page shows the logged date as plain muted text with the year ("Completed · 3 Nov 2026"), see §13.

### 5.4 Paper tags and personal user tags
Category badges (`LogRow`, `LogTile`, `BookCard`, `MusicCard`, the "Logged" badge) get `--tag`/`--tag-foreground` as plain rounded pills with even padding (`0.125rem 8px`), no punched hole. Use a utility class `.tag` in `index.css` so every badge gets it from one place.

Personal tags created by the user use an outlined pill style with utility class `.user-tag` in `index.css`: `border: 1px solid var(--border-strong)`, background transparent (hover `var(--muted)`), `color: var(--foreground)`, rendered with a leading `#`. On `LogRow` and `LogTile`, user tags appear before provider categories, and clicking a user tag button on `LogRow` applies the Logs Tag filter.

The tag input component (`TagInput`) provides an accessible combobox (`role="combobox"` with listbox popup):
- Shows chips for current tags, each with a remove button (`aria-label="Remove tag {name}"`).
- Commits a tag on Enter, comma, or Tab (when input is non-empty); Backspace on empty input removes the last chip.
- Autocomplete suggestions from `/tags` filtered case-insensitively, navigated with arrow keys, and offering "Create “x”" when there is no exact match.
- Enforces limits: 1–40 chars, no commas, at most 20 tags per log, and sends tags only when modified.

### 5.5 Empty states (dude + bubble)
| Where | Line |
|---|---|
| Logs, no logs | "nothing logged yet. go find something good." (+ existing hint about searching) |
| Logs / Media, filters match nothing | "nothing matches. i looked under your bed too." |
| Media, none created | "no media of your own yet. the shelf is very clean." |
| Search, no results | "couldn't find that one. too niche?" |
| Search, all results hidden by "Hide logged" | "you've logged all of these. impressive, honestly." (keep the "More …" button) |
| Media types, none | "no types yet. books? records? rocks?" |
| Collections, none / one is empty | "no collections yet. make a shelf of favourites?" / "this collection is empty. add some logs to get started." |
| Stats, nothing logged | "no stats yet. log a few things and i'll start counting." |

The dude's eyes look *down* at the line in every empty state. Keep the existing message text where it gives instructions, and put the dude's line in the bubble above it.

### 5.6 Loading copy
One line per mount from `LOADING_LINES` in `lib/whimsy.ts` (don't cycle while loading), e.g. "lotta dust on these shelves…", "flipping through…", "pray that the api have whatever niche you're into…".
Keep `animate-pulse`, but under reduced motion show static text.

### 5.7 Small copy changes
| Where | Now | New |
|---|---|---|
| Section subtitles | (Logs, Media, Settings and the search pages had handwritten lines) | Removed in Direction A. Page headers are the title plus an optional count only. |
| Delete confirm | (current warning) | keep the warning, then add: "it'll be like it never happened." |
| Rating 100 on a log | "Rating: 100" | same. (The pixel star next to a 100 rating was removed at the user's request; it is plain text like every other rating.) |
| Login card title | "Login" | "Welcome back" (Fraunces). The dude's thought above the card, in Caveat: *"oh, it's you!"* |
| Register card title | "Register" (or similar) | "Pull up a chair" |

Keep all button labels and form labels plain. Whimsy never replaces function words.

### 5.9 Page backdrops
A giant blue dude sits behind the Logs page and, since task 17, every search page (Books, Music, Anime, Movies, TV, Games): the sidebar dude's pixel grid (`lib/dude.ts`, not duplicated) drawn as one SVG about 120vh tall, rotated -8 degrees and half off the bottom-right edge. It is `aria-hidden`, `pointer-events-none`, perfectly still (no animation, so it respects §5.8), at 7% opacity in light and 10% in dark, and hidden when printing. Log rows, tiles and group headings sit on `bg-card/80` or `bg-background/70` surfaces with a light blur so body text keeps at least 4.5:1 contrast over it (checked in `.relayer/contrast.logs-backdrop.py`: lowest ratio 5.1).

**Per-page placements.** `lib/backdropPlacements.ts` is the single table (anchor offsets in `%`/`vh`/`vw`, size in vh, rotation, optional `flipX`); `PageBackdrop` builds its CSS from it. **All page dudes are the same size (120vh)**, the Logs dude's size; the search placements were re-tuned for it (checked by `placements.check.ts`). Logs stays bottom-right, -8°. Books: peeking in from the left edge, +10°. Music: bottom-left corner, -14°. Anime: upside down (180°) from the top edge, right of centre (shifted further right at 120vh so both eyes fit at 375px). Movies: rising from the bottom edge, centred, top half only, 0°. TV: peeking in from the right edge, higher, -6°, `flipX`. Games: on his side at the right edge (-90°, `flipX`, facing into the page).

**Eyes-visible rule.** On every search placement both eye pixels (grid row 5, columns 5 and 10) must land inside the content area (viewport minus the 240px sidebar at ≥ 1024px, the full width below) at 1280×800, 1920×1080 and 375×667. `eyePointsOnScreen(placement, viewport)` composes the same transform as the CSS (flip, then rotate, about the centre) and is checked in `.relayer/placements.check.ts`. Retune the table, never the check. Roots using it are `relative isolate overflow-hidden`; the layer is `-z-10`, so content paints above it.

**Use your own photo:** drop a file named `backdrop-<page>.jpg`, `.png` or `.webp` (page = `books`, `music`, `anime`, `movies`, `tv`, `games`; Logs keeps `logs-backdrop.*`) into `client/src/assets/` and rebuild or restart the dev server. It replaces the dude on that page only, as a cover-fit, centred, 30% grayscale background at the same opacity. It is optional, resolved at build time (`import.meta.glob`), and not committed; don't add one to the repo.

**Turn it off:** Settings → Preferences → "Page backdrops (the giant blue dude)" turns off Logs and all search pages. The choice is stored per device in `localStorage` (`logs.backdrop`, default on), not synced to the server.

### 5.10 Letters to later (the wax seal)
Whimsy at the edges: a small seal on a log, never a banner.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--wax` | `#a8391f` | `#d0603f` | the seal |
| `--wax-dark` | `#6e2412` | `#8a3320` | the ring pressed into it |
| `--gold` | `#a87a12` | `#e3b04b` | a letter that's ready to open |
| `--gold-dark` | `#5e4208` | `#8a5f14` | the ring on the gold seal |

`WaxSeal` has three tones:
- **sealed:** `--wax` with a `--wax-dark` ring;
- **ready:** `--gold` with a `--gold-dark` ring and a small white shine (the amber `--primary` was too close to the wax, `#a8481f` vs `#a8391f`);
- **opened:** no fill, outline and ring in `--muted-foreground`, an empty broken seal that steps back so ready ones stand out.

`--gold` against `--card` is 3.6 (light, `#fbf8f2`) and 8.0 (dark, `#26211d`), above 3:1.

Contrast: `--wax` against `--card` is 6.1 (light) and 4.1 (dark), against `--tag` 5.1 and 3.4 (needs 3:1). Chip text is `--tag-foreground` on `--tag` (5.9 / 8.0); the "Letter ready" chip is `--primary` on `--card` (5.5 / 6.0). The mockup's dark wax `#b5462e` was lightened: 2.9:1 on the card.

The seal is `components/letters/WaxSeal.tsx`. Rows: seal + "Letter sealed" / "2 letters sealed" beside the title; tiles: the seal alone with an accessible name. "Letter ready" is a button.

### 5.8 Things we will *not* do
Confetti, sound, cursor trails, parallax, animated backgrounds, mascot walking around the screen, emoji, rainbow anything, achievement popups, dark-mode stars.

---

## 6. Components: what changes (reskin record)

> Historical: this is the reskin's change list. Some files named here have since been replaced (`components/cards/*` became `components/logs/LogRow|LogTile`, `components/media/*`, `components/search/Result*`), and the sidebar moved to the left (§12).

Ordered by impact. "Tokenise" means replacing hard-coded Tailwind colours with token utilities, using the map in §7.

| File | Change |
|---|---|
| `src/index.css` | New `:root` / `.dark` values (§2), new tokens added to `@theme inline` (`--color-link`, `--color-tag`, `--color-tag-foreground`, `--color-stamp`, `--color-border-strong`, `--color-dude`, `--color-dude-shade`), fonts (§3), body grain/glow, `.tag` and `.stamp` utilities, a reduced-motion block. Replace the `:focus { --tw-ring-color: amber.300 }` hack with the token ring. Keep `.scrollbar-hide`. |
| `index.html` | Google Fonts link, plus the theme bootstrap script before the app loads (§8). Title stays "MediaTracker". |
| `src/App.css` | Unused Vite leftover (not imported). Delete it. |
| `components/ui/button.tsx` | `amber` variant → `bg-primary text-primary-foreground hover:bg-primary/90`. Keep the name `amber` so no callers change. `link`/`boldedLink` → `text-foreground`, with underline offset 4. `outline` uses `border-border-strong`. Add `cursor-pointer` to the base. |
| `components/ui/input.tsx`, `textarea.tsx`, `select.tsx` | Border `--input`, background `--card`. Already token-based, so this mostly comes free. Check that the placeholder uses `--muted-foreground`. |
| `pages/Homepage.tsx` | `bg-stone-100` → `bg-background`. Sidebar `bg-stone-300` → `bg-sidebar` with `border-l border-border`. Nav buttons: `text-stone-600` → `text-muted-foreground`, and the active one `text-foreground font-semibold` plus a 2px `--primary` bar on its left edge instead of only bold. The hand-written `shadow-[...]` dividers become `border-b border-border`. Add `<BlueDude/>` and `<ThemeToggle/>` pinned at the bottom of the column (`mt-auto`). |
| Section headers (`LogSection`, `MediaSection`, `MediaTypeSection`, search sections, `Settings`) | Direction A: no grey strip; the header sits on the paper (`px-6 pt-6 pb-4`). Title `font-display text-4xl`, optional count line at the right (Logs: "214 logs · 38 this year"), controls on their own row below. No `font-hand` subtitle. |
| `components/cards/LogCard.tsx` | `bg-white` → `bg-card`, `border-border`, `shadow-sm` → a softer custom shadow `0 1px 0 rgb(43 37 32 / 0.04), 0 2px 8px -4px rgb(43 37 32 / 0.12)` (dark: no shadow, just the border). Cover image: `rounded-sm` plus a 1px `--border` ring, like a photo tucked into a notebook. Date → `.stamp` (§5.3). Badges → `.tag`. "More info" → `text-link underline-offset-4 hover:underline`, no pill. Metadata `text-stone-600` → `text-muted-foreground`. |
| `components/cards/BookCard.tsx`, `MusicCard.tsx`, `MediaCard.tsx` | Same treatment as LogCard. `text-gray-500/600` → `text-muted-foreground`. |
| `components/cards/MediaTypeGroupCard.tsx` | Heading `font-display text-2xl`. `Separator` → `bg-border`. Optional: a small `font-hand` count after the heading ("— 12 of them"). |
| `components/ui/DataControls.tsx` | `BADGE_STYLES`: `stone` → `bg-muted text-foreground border-border`, `amber` → `bg-tag text-tag-foreground border-tag`, `blue` → `bg-card text-link border-link/40`. `bg-white` on inputs and buttons → `bg-card`. Active sort chip: the blue becomes `--link`. Red hovers → `--destructive`. |
| `components/dialogs/ConfirmDeleteDialog.tsx` | Add the dude (§4.4) and the extra line (§5.7). Delete button stays `destructive`. |
| `pages/auth/Login.tsx`, `Register.tsx` | `bg-stone-100` → `bg-background`. Card → `bg-card` with no `shadow-2xl` (use the soft card shadow). Dude peeking over the top edge. Error `text-red-500` → `text-destructive`. |
| `forms/*` | Tokenise. Many `bg-gray-50` / `border-gray-300` inputs are here: use the `Input` styles or tokens. |
| **New** `src/components/BlueDude.tsx` | §4. Props: `size: 32 \| 48 \| 64 \| 96`, `mood?: "idle" \| "lookDown" \| "lookAway" \| "asleep"`, `interactive?: boolean` (enables click lines and sleep), `glance?: "up" \| "down" \| "left" \| "right" \| null`. |
| **New** `src/components/SpeechBubble.tsx` | Pixel-edged bubble: 2px `--foreground` border with a stepped corner (no border-radius; use `clip-path` or a box-shadow pixel corner), `bg-card`, Silkscreen text, a 4px triangle tail. `role="status"` with `aria-live="polite"` for clicked lines. Empty-state bubbles are static text. |
| **New** `src/components/ThemeToggle.tsx` + `src/lib/theme.ts` | §8. |

**Layout must not change:** column widths, header heights, list spacing, card internal structure, dialog sizes and the order of controls all stay the same.

---

## 7. Hard-coded colour → token map

Use this for the bulk find-and-replace in `src/` (`components/ui/*` is mostly already token-based).

| Old | New |
|---|---|
| `bg-white` | `bg-card` |
| `bg-stone-50`, `bg-stone-50/50`, `bg-stone-100`, `bg-gray-50`, `bg-gray-100` | `bg-background` (page) or `bg-muted` (hover/fill) |
| `bg-stone-200` | `bg-secondary` |
| `bg-stone-300` | `bg-sidebar` (sidebar) or `bg-border` (thin dividers) |
| `text-stone-800`, `text-stone-900`, `text-stone-700` | `text-foreground` |
| `text-stone-500`, `text-stone-600`, `text-gray-500`, `text-gray-600` | `text-muted-foreground` |
| `text-stone-400`, `text-gray-400` | `text-muted-foreground` (icons; check 3:1 for meaningful icons) |
| `border-gray-200`, `border-stone-200`, `border-stone-300` | `border-border` |
| `border-gray-300` (inputs) | `border-input` |
| `bg-amber-100 text-amber-800` / `bg-amber-50` | `.tag` (or `bg-tag text-tag-foreground`) |
| `bg-amber-600` | `bg-primary` |
| `text-red-500`, `text-red-600`, `hover:text-red-500` | `text-destructive` |
| `bg-red-50` | `bg-destructive/10` |
| `text-blue-*`, `border-blue-*` | `text-link`, `border-link/40` |

When this is done, `grep -rE "(bg|text|border)-(stone|gray|amber|blue|red)-[0-9]" src` should return nothing. That's the acceptance check for "tokenised".

---

## 8. Dark mode mechanics

- The class strategy already exists: `@custom-variant dark (&:is(.dark *));` is in `index.css`. Put `.dark` on `<html>` so Radix portals (dialogs, menus, selects) inherit it.
- `src/lib/theme.ts`: `type ThemePref = "light" | "dark" | "system"`. It reads and writes `localStorage["theme"]` inside **try/catch** and falls back to `"system"`. `applyTheme(pref)` toggles `.dark` and sets `color-scheme` on `<html>`. In `"system"` mode it listens to `matchMedia("(prefers-color-scheme: dark)")`.
- **No flash:** a tiny inline `<script>` in `index.html` `<head>` runs the same logic before React mounts. It's a duplicate of about 6 lines, which is fine, and also wrapped in try/catch.
- Add `<meta name="color-scheme" content="light dark">` so native scrollbars and form controls follow.
- Images: in dark mode, cover images get `opacity: 0.92` to take the glare off. That's all; don't filter them.
- Settings later (roadmap: settings backend/UI): the theme preference can move to the user's server-side settings. For now it's per device in localStorage.

---

## 9. Motion

| Token | Value | Used for |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.2, 0.7, 0.2, 1)` | hovers, dialogs opening |
| `--dur-fast` | 120ms | button hover/press, blink |
| `--dur-base` | 200ms | card hover, menu open |
| `--dur-slow` | 320ms | dialog in (exit is 200ms) |
| pixel steps | `steps(2)` / `steps(3)` | anything the dude does |

- Cards: on hover the border goes to `--border-strong`. No lift, no scale. Quiet.
- Buttons: `active:translate-y-px`. That's the only "press" feedback.
- **`prefers-reduced-motion: reduce`:** no hop, the blink becomes an instant swap at most once every 10s, bubbles appear without a fade, and `animate-pulse` is off. Put this in one `@media` block in `index.css`, plus a `useReducedMotion()` check in `BlueDude`.
- Nothing animates on page load except the dialogs' existing `tw-animate-css` enter/exit.

---

## 10. Accessibility checklist (both themes)

- [ ] Text contrast meets the §2 tables. Re-check any new pairing before using it, and never put `--link` text on `--sidebar` in light mode.
- [ ] Focus: 3px ring in `--ring`/50 on every interactive element. Don't remove outlines.
- [ ] Every mascot instance is `aria-hidden`, except on the login page. Clicked lines are announced politely, and empty-state lines are plain text, so screen readers read them.
- [ ] The dude is a `<button aria-label="Poke the blue guy">` in the sidebar, keyboard-focusable, and Enter/Space pokes him.
- [ ] The theme toggle has a visible label (not icon-only), and `aria-label` states the current mode.
- [ ] Information is never shown by colour alone: tags have text, the stamp has text.
- [ ] Check at 375px wide. The sidebar already exists at that width, so check the dude and toggle still fit in `w-30` (they should: 48px dude, toggle wraps its label below the icon if needed).
- [ ] Reduced motion as described in §9.

---

## 11. Reskin build order (done)

1. **Round A: theme and tokens.** `index.css` tokens and fonts, `index.html` fonts and bootstrap script, `theme.ts` + `ThemeToggle`, `button.tsx` variants, the token map from §7 across `src/`, header/subtitle typography, delete `App.css`. Done when the grep in §7 is clean, both themes look right on every page, and lint and build pass.
2. **Round B: the dude and whimsy.** `BlueDude`, `SpeechBubble`, sidebar home (5.1), empty states (5.5), stamp (5.3), tags (5.4), loading copy (5.6), copy changes (5.7), login/register/delete-dialog appearances.

Each whimsy item in round B can be cut on its own without breaking anything else.


## 12. Direction A: app shell (task 14)

Mockups: https://claude.ai/artifact/1T1tND4UjW7G6Qg7DPkaSU (Main.dc.html = A "Reading room", Shelf.dc.html = B "Shelf grid").

- **Layout:** a ~240px left sidebar (`bg-sidebar`) at ≥ 1024px: logo row (dude at 32px + "MediaTracker"), nav (Logs, Your media, Media types), a "Find something" group (Books, Music, Anime & manga, Movies, Games), then Settings and the theme toggle pinned to the bottom. Below 1024px it becomes a top bar with the logo and a menu button that opens the same nav in a `Dialog` sheet.
- **Nav items:** lucide icon plus label, 36px tall, `rounded-lg`. Active `bg-card text-foreground font-semibold`; inactive `text-muted-foreground`, hover `bg-card/60`.
- **Dude:** the glance still follows nav hover/focus; his speech bubble opens below him (`SpeechBubble tail="up"`).
- **Controls:** search is a pill (`rounded-full h-10`); filter/sort/view triggers are chips (`rounded-full h-9 border-border-strong bg-card`); active badges are small pills; the Settings tab bar uses the same chips.

## 13. Logs page: rows and tiles (task 15)

- **Controls:** a List / Grid segmented pill (`aria-pressed`, labels at ≥ 640px) and a "Group: Month / Type / None" select. Defaults List + Month, stored in `localStorage` (`logs.view`, `logs.group`).
- **Row (direction A):** `<li>` with a top border, no box. Cover (56×80 portrait, 64×64 music, 80×50 game), title in `font-display` with a muted "creator · year" byline, original title, type label + metadata, notes (italic, 3-line clamp, More/Less when long), category tags, "More info". Right column: rating (`/100`), "Status · 3 Nov 2026", and the "⋯" actions menu. Below 480px the right column drops under the content.
- **Tile (direction B):** cover filling a `repeat(auto-fill, minmax(150px, 1fr))` cell with the aspect from the type, status badge top-left, title + rating, "type · creator", date, "⋯" menu.
- **Expanded children:** expanding an album fetches and merges its full MusicBrainz tracklist (unlogged tracks show "–" with the same Edit button as logged ones); expanding a show lists every season 1…N from stored `seasonCount`.
- **Covers:** without an image, a block in `--cover-1..6` (from the media id) with the title's first letter in `--cover-ink` (≥ 4.5:1 in both themes).

## 13a. Shared media-view pieces and the Media page (task 17)

Shared, in `components/media-view/`: `Cover` (id, title, imageUrl, aspect, size), `RowShell` (frosted row: cover, body, aside; the aside drops under the body at ≤ 480px), `TileShell` (cover + optional badge, frosted footer), `GroupHeading` (frosted pill), `ClampText` (3-line clamp, More/Less only when really cut off, `aria-expanded`), `ViewControls` (List/Grid pill + "Group:" select), `PageBackdrop`. Helpers: `lib/mediaView.ts` (`aspectForMedia`, `coverToken`). Logs and Your media both use them.

**Your media** (`pages/sections/MediaSection.tsx`): List by default, grouped by Type (alphabetical, `GroupHeading`), or Grid; "Group: Type / None". Stored as `media.view` and `media.group`.
- **Row** (`components/media/MediaRow.tsx`): cover, title + "creator · year", type label + metadata parts, description (3-line clamp, not italic), category tags, "More info". Aside: when logged, the rating and "Status · 3 Nov 2026"; otherwise "Not logged" and an amber "+ Log" button. Then the "⋯" menu: Edit media, Edit log (only when logged), Delete media.
- **Tile** (`MediaTile.tsx`): cover with a "Logged" / "Not logged" badge, title + rating, "type · creator", "⋯" menu (adds "Log it" when not logged).

### Search results and "Load more…" (task 18)

- **Result row** (`components/search/ResultRow.tsx`, on `RowShell`): cover (portrait; square for music, wide for games), title in `font-display` with a muted "creator · year" byline, original title, a detail line (kind label in small caps `text-link`, then `resultDetailParts` from `lib/resultView.ts`: book publisher / pages, music Album / Track, or the anime / movie / game format helpers), description in `ClampText`, category tags, and the provider link ("View on Open Library / Google Books / Last.fm / MyAnimeList / TMDB / RAWG"). Aside: a "Logged" tag when logged, then the amber "+ Log" button, which reads "Edit log" when the item is already logged (it opens the existing log, as before).
- **Result tile** (`ResultTile.tsx`, on `TileShell`): cover with a "Logged" badge, title, "kind · creator", compact "+ Log" / "Edit log". Grid is `repeat(auto-fill, minmax(150px, 1fr))`, same as Logs.
- **Covers** without an image use the lettered block; the colour comes from `coverTokenFromKey("source:sourceId")`.
- **Controls:** `ViewControls` without `groupOptions` shows only the List / Grid pill. It sits beside "Hide logged". The choice is stored per page as `search.view.books|music|anime|movies|tv|games` (default List). Paging, Hide logged, empty / loading / error states and backdrops are unchanged.
- **Load more…** (Logs and Your media, `hooks/useGroupReveal.ts`, `components/media-view/GroupFooter.tsx`, helpers in `lib/logView.ts`): each group shows its first 5 rows / 12 tiles (the unlabelled "None" group: 20 rows / 24 tiles). A pill under the group reads "Load more… (N more)", reveals the same number again, and disappears when everything is shown. Counts are kept per group key and reset when the search, filters, sorts, group mode or view change; editing or deleting an item keeps them. The button is a real `<button>` with `aria-label="Load more {group}, {N} more"`; after a reveal, focus moves to the first newly shown row or tile (`tabIndex={-1}` on `<li>` only for that).
- **Load all and Collapse** (task 20): the footer is one `flex flex-wrap gap-2` row of pills. "Load all (N)" (N = the group's total) shows while items remain and more than one step remains (otherwise Load more already does it). "Collapse" (`ChevronsUp` + text) shows once the group is expanded (shown > initial) and resets only that group to its initial count. While expanded, the group's heading row is `sticky top-0 z-10` inside the page's `overflow-y-auto` scroll container (frosted `bg-background/70 backdrop-blur-sm`, full width) with a Collapse pill on the right; the group "None" gets a bar with only the pill. Collapsing scrolls the group's heading into view (`behavior: "auto"` under reduced motion, else `"smooth"`) and focuses it (`<h2 tabIndex={-1}>`; for "None", the first item). Rows, tiles and headings carry `scroll-mt-14` so focus and scrolling never hide them under the sticky row. Load more and Load all focus the first newly revealed item. `aria-label`s: "Load all {group}, {N} items", "Collapse {group}" (group name left out for None). Reset rules are unchanged.


## 14. Stats page (task 22)

- **Data:** all client-side from `GET /logs` (`lib/stats.ts`, pure and tested). Range select: All time / Last 12 months / each year; stored as `stats.range`. No page backdrop; one static `SpeechBubble` line from `pickStatsLine`.
- **Charts** are hand-built SVG/CSS with tokens only: `--chart-1..5` for the top 5 types (assigned from overall counts, so colours don't move with the range), `--muted-foreground` for "Other". Never a literal colour.
- **Every chart** sits in a `StatsFigure`: a `figure` with a one-sentence summary and a "Show as table" toggle that swaps in a real `<table>`.
- **Colour is never the only signal:** a visible legend, tooltips and aria-labels carry the same facts.
- **Tooltips are not hover-only:** bars are focusable (`tabIndex=0`, `aria-label`), and hover, focus and tap all fill a fixed line above the chart (never clipped by the scroller).
- **Narrow screens:** wide month ranges scroll inside the chart box (`overflow-x-auto`), x labels thin to every 3rd month, and the page never scrolls sideways. No animation is used, so reduced motion needs nothing special.
- **Date basis & type-specific detail (task 26):** Stats are dated by the finish date when set (`finished_at`), falling back to the logged date (`logged_at`) otherwise. Under the period select, a muted note explains the basis. Below the charts, a responsive "By type in detail" grid (1 column on mobile, 2 on tablets, 3 on desktop) displays cards for types with completed logs in range: pages read and longest book (books), hours watched and longest film (movies), episodes and estimated watch time (anime), chapters and volumes (manga), estimated playtime and top platforms (games), album and track counts (music), and average/median time to finish across every type. When metadata has gaps, each figure displays a muted "Based on N of M completed" coverage line, missing/non-positive values are ignored rather than counted as zero, and metrics without any data show "—" with an arrival hint. External metrics (e.g. RAWG playtime, anime episode durations) are explicitly labelled as estimates.

## 15. Collections (task 28)

Private, ordered lists of user logs (`pages/sections/CollectionsSection.tsx`, `components/collections/*`, `lib/collectionHelpers.ts`).
- **Navigation:** "Collections" tab (`ListOrdered` icon) after "Your media" in sidebar and mobile sheet. Supported in user preferences `defaultTab: "collections"`.
- **Index view:**
  - Header with title ("Collections") and an amber pill button ("+ New collection").
  - Responsive grid: 1 column at 375px (`grid-cols-1`), expanding to `sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4`.
  - **Collection cards (`CollectionCard.tsx`):** a 2×2 cover mosaic (`coverMosaic`) from the first items' covers, falling back to lettered `Cover` square tiles; collection title in `font-display`; item count badge ("N items · Ranked" or "N items"); description clamped to 2 lines (`line-clamp-2`).
  - Empty state: `EmptyState` with dude line `"no collections yet. make a shelf of favourites?"`.
- **Detail view:**
  - In-place view managed via local state `selectedId` with "Back to collections" button.
  - Header: collection title in `font-display`, description, count badge, and actions: "Add logs", "Edit" (opens edit dialog: name, description, ranked flag), and "Delete" (confirm dialog noting logs are kept).
  - Empty collection: dashed card with BlueDude, `"this collection is empty. add some logs to get started."`, and an "Add logs" call to action.
  - Items rendered as rows using `RowShell` and `Cover`. **Only ranked collections show positions.**
  - Ranked: the position is a small number input (`RankInput`); type a rank and press Enter (or click away) to move the item there, Escape restores it, values clamp to 1..N. The up/down arrows are gone. Unranked collections show no numbers and no reorder controls.
  - Every row keeps Remove from collection (`Trash2`, with an `aria-label`), wrapping cleanly at 375px.
  - **Reorder & Accessibility:** Optimistic list reordering with server sync (`PUT /collections/:id/order`) and rollback on failure. Focus is preserved on the moved item's active move button across re-renders. An always-mounted polite live region (`aria-live="polite"`) announces `"Moved {title} to position {n}"`.
  - **Add logs dialog (`AddLogsDialog.tsx`):** search logs by title or creator, checkbox selection with existing items checked, applying computes `membershipDiff` to add/remove diffs.
- **Log actions integration:** `LogActions` includes "Add to collection…", which opens `AddToCollectionDialog` with checkboxes for user collections and an inline "New collection" creation form.


## 16. Landing page (built)

Mock: https://claude.ai/artifact/Fe1EhuNYSqMHGnQg3TCUWN . A one-screen, funny front door for people who aren't logged in. **Pattern:** minimal single column (one hero, one primary action, a footer; no feature grid, screenshots or testimonials).

### Route and flow
- **`/`** shows the landing page when logged out. Logged-in visitors go straight to `/homepage` (same check as today's redirect).
- The catch-all `*` keeps redirecting to `/login` for unknown paths; only `/` changes. `/login` and `/register` are unchanged, and Register stays reachable from the Login card.
- No nav bar. The page is `min-h-dvh`, centred, and never scrolls sideways.

### Layout (top to bottom)
1. **Top row:** wordmark "MediaTracker" (`font-display`, `text-2xl`, plain text) on the left; on the right the **theme switch as three icon buttons** in one pill (lucide `Sun` / `Moon` / `Monitor`, 32px each, `aria-label`s "Light theme" / "Dark theme" / "Follow the system theme", `aria-pressed` on the current one). Same `lib/theme.ts` as the app.
2. **Headline** (`font-display`, `text-4xl sm:text-5xl`, `text-balance`): *"Log everything you read, watch, play and listen to."* One muted line under it: *"Books, music, anime, movies, TV, games and board games, in one journal you can host yourself."*
3. **The offer** (the centrepiece): the dude at 160px (a multiple of 16) with **two hands held out palm-up**, one each side, in the "pick one" pose. Each palm holds a pill-shaped button: the buttons *are* the pills.
   - **Left hand (blue):** "Check me out" → `https://sock1000kg.io.vn/`. A filled **blue** pill: `--dude` background with fixed dark ink text `#1d1916` in both themes (about 10:1; white on this cyan would fail contrast), 2px black outline like the red one, slightly smaller than "Try it out".
   - **Right hand (red):** "Try it out" → `/login`. Filled `--primary`, slightly larger. Red is the rabbit hole, so it's the one we want people to take.
   - **Hand art is the user's own**: a 32×32 pixel hand, palm up, fingers pointing outward, wrist toward the dude. `src/assets/landing/hand-right.png` is the user's drawing (white background made transparent, hand pixels made fully opaque, colours unchanged). `hand-left.png` is its mirror, recoloured to the dude's cyan with the painted shading kept. Render both `aria-hidden` with `image-rendering: pixelated`, the same size as the dude (32 art pixels in 16 dude pixels), **in front of** the dude (hands above him in stacking order, both of them), sitting a little lower than his middle, wrists overlapping his sides. Each pill sits on the palm (about 42% / 58% across, 36% down). No hand-coded pixel hands.
   - No handwritten aside on this page.
   - The dude's eyes glance toward whichever button is hovered or focused (§4 glance, 1px), and blink as usual.
4. **Footer** (`text-xs text-muted-foreground`): a single "GitHub" link to the repository, and "Data from Open Library, Last.fm, AniList, TMDB, RAWG and BoardGameGeek."

### Demo account card (on the Login page, not the landing)
- A small card pinned to the **top-right corner of `/login`** (`absolute top-3 right-3`, `max-w-60`, `bg-card`, soft card shadow, `text-sm`). Title "Just looking?", then `user: demo` and `pass: …` in monospace. No copy buttons: the fill button below does the job.
- A text button **"Fill in the form for me"** fills both login fields and moves focus to the password field; the user still presses Sign in.
- Below 640px the card sits above the login card (normal flow, full width) instead of floating over it.
- Not on `/register`.

### Where the demo credentials come from
- Not hard-coded in the client. `GET /config` (the limits endpoint) gains `demo: { username, password } | null`.
- The server fills it only when **`PUBLIC_DEMO=true`** and `DEMO_USER_PASSWORD` is set. Default off, so a fresh self-hosted install never publishes a password it didn't mean to.
- When `demo` is `null`, the card is not rendered at all.

### Sizes and breakpoints
- **≥ 768px:** hands sit left and right of the dude at palm height, buttons `h-12 px-6` (well over the 44px target).
- **< 768px:** the dude shrinks to 80px and the hands come in close; the buttons stay side by side at 375px (they fit at `text-sm px-4`), otherwise they stack with red on top.
- Backdrop: none (the dude is already the hero). Body grain and lamplight glow as on every page.

### Motion
- The hands may bob 2px with `steps(2)`, out of phase, once the art exists. Under `prefers-reduced-motion` they're still.
- Press feedback on the pills is the normal `active:translate-y-px`. Nothing else moves; no entrance animation.

### Accessibility
- Tab order follows the picture: theme buttons → "Check me out" → "Try it out" → footer. DOM order = visual order; the primary stands out by fill and size, not by going first.
- The dude + hands illustration is one `role="img"` with `aria-label="The blue guy holding out two buttons, one in each hand"`; hand images are `aria-hidden`. The buttons are real `<a>` elements layered on the palms.
- "Check me out" opens in the same tab. If it later opens a new tab, add the `ExternalLink` icon and "(opens in a new tab)" for screen readers.
- Contrast: `--primary-foreground` on `--primary` (5.5:1 light, 6.6:1 dark); `#1d1916` on `--dude` for the blue pill (about 10:1).
- Both themes designed together: in Lamplight the outlines get the same 0.5px light drop shadow as the dude.

### Out of scope
Feature lists, screenshots, pricing, sign-up forms on the landing page itself, cookie banners, analytics.

## 17. Search pages: shared structure (2026-11)

All six search pages are thin: state + a `fetchPage` + their own controls. Everything else is shared, so a fix lands everywhere at once.
- `components/search/SearchPageShell` (frame + backdrop), `SearchHeader` (title, attribution, the "Type a name..." input from `SEARCH_PLACEHOLDER`, the round Search button, **disabled while a search runs**, then page controls), `SearchResults` (loading line, errors, missing-key notice, toolbar with List/Grid + Hide logged, empty states, the "More" button), `SearchControls` (`FilterSelect` for header dropdowns, `YearInput`).
- Hooks: `useProviderSearch` (paged query, de-duplicated by `sourceId`, hidden-logged split, `busy`), `useSearchLogging` (log dialog; create or edit; refreshes logs, media and tags), `useHideLogged(page)` (server pref, then device value).
- `lib/searchQuery.ts`: the placeholder, `MISSING_KEY_PROVIDERS` (server error → "You'll need a TMDB / RAWG / Last.fm / BoardGameGeek key first"), `searchOnEnter`, `parseYear`.
- Every provider that needs a key uses **the user's own key** (Settings → API Keys). The server's env keys only seed the demo account.

## 18. Board games (task 40)

- Games search includes a Board games mode powered by BoardGameGeek with square covers, player counts, playtime, and BGG ratings.

## 19. The pile on the Stats page (task 59)

The first block of the Stats page body (`components/stats/StatsPile.tsx`), shown once the user has any log in the selected period. It reflects the Stats controls (`filteredLogs` by period and type tab). The pile has no caption: the card is just the drawing, a column on the left of the six summary tiles (2 rows of 3) at `lg` and above, and above them below `lg`. It is drawn in a 480×200 area with the pile resting on the card's bottom edge. One decorative object per log (at most the newest 150 drawn, oldest first), by media type: book (and custom types) a slab, wider with more pages; manga a thin slab; movie/TV a case with a dotted left edge; anime a grey disc edge-on with a dark bottom edge; music a record; game a cartridge; board game a box. Object dimensions scale by `s = max(0.6, min(1.35, sqrt(55 / n)))` where `n` is the number of objects drawn (at 150 the settled pile reaches near the top of the card). Each Stats selection change (period or type) re-drops the pile, even when the drawn logs are the same. Colours come from `--cover-1`…`--cover-6`; the ground is `--ground`. The layout (`lib/statsPile.ts`) is deterministic: spawn position, size and tilt are seeded from the log id, so the same logs settle the same way. Each time the selection changes the objects drop from above the card and fall into place under a real 2D physics world (matter-js, lazy-loaded in its own chunk), colliding with the ground and the side walls. With reduced motion the settled pile is shown at once. The SVG is `aria-hidden`, with no hover or click; the charts and tables below are the real UI.

