# MediaTracker: design direction

> A quiet place to keep track of what you've read and listened to.
> Warm paper by day, lamplight by night, and a small blue guy who lives in the sidebar and has opinions.

This document describes the redesign. **It is a reskin, not a rebuild.** The layout (content on the left, nav sidebar on the right, header strip above each section, list of cards) stays as it is. Most of the change happens in `src/index.css` tokens and in swapping hard-coded Tailwind colours for those tokens. The new bits are a theme toggle, one small mascot component and some copy.

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
| **Marginalia** | **Caveat** 500 | **only** the mascot's thought on the login page and the line in the delete dialog. Page headers no longer carry a handwritten subtitle (removed in Direction A, task 14) | Rotated, coloured `--muted-foreground`. At most one per screen. |
| **Pixel** | **Silkscreen** 400 | **only** inside the mascot's speech bubble | Uppercase, small (0.65rem). It ties the mascot to the UI. |

- Keep `html { font-size: 120% }`. The scale already works at that base.
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
1. **Sidebar footer** (bottom of the right column, 48px, centred), above the new theme toggle. This is his home.
2. **Empty states** (64px) with a speech bubble.
3. **Login / Register** (96px), standing on top of the card's top edge, as if he's peeking over it.
4. **Delete confirm dialog** (32px, next to the title), with eyes looking away.

Nowhere else. He's a guest, not wallpaper.

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

### 5.2 Theme toggle (required)
Under the dude: a small ghost button with lucide `Sun`/`Moon` and the label **"Daylight" / "Lamplight"**. Cycles light → dark → system. "System" shows as "Follow the window" with a `Monitor` icon. When switching to dark, the dude blinks once, slowly (400ms).

### 5.3 Date stamp (retired in task 15)
The rotated `.stamp` pill is gone. The Logs page shows the logged date as plain muted text with the year ("Completed · 3 Nov 2026"), see §13.

### 5.4 Paper tags
Category badges (`LogRow`, `LogTile`, `BookCard`, `MusicCard`, the "Logged" badge) get `--tag`/`--tag-foreground` as plain rounded pills with even padding (`0.125rem 8px`), no punched hole. Use a utility class `.tag` in `index.css` so every badge gets it from one place.

### 5.5 Empty states (dude + bubble)
| Where | Line |
|---|---|
| Logs, no logs | "nothing logged yet. go find something good." (+ existing hint about searching) |
| Logs / Media, filters match nothing | "nothing matches. i looked under the couch too." |
| Media, none created | "no media of your own yet. the shelf is very clean." |
| Search, no results | "couldn't find that one. try fewer words?" |
| Search, all results hidden by "Hide logged" | "you've logged all of these. impressive, honestly." (keep the "More …" button) |
| Media types, none | "no types yet. books? records? rocks?" |

The dude's eyes look *down* at the line in every empty state. Keep the existing message text where it gives instructions, and put the dude's line in the bubble above it.

### 5.6 Loading copy
Replace "Loading logs..." and similar with rotating lines (pick one per mount, don't cycle while loading):
"dusting the shelves…", "finding your place…", "flipping through…", "putting the kettle on…".
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
A giant blue dude sits behind the Logs page and, since task 17, every search page (Books, Music, Anime, Movies, Games): the sidebar dude's pixel grid (`lib/dude.ts`, not duplicated) drawn as one SVG about 120vh tall, rotated -8 degrees and half off the bottom-right edge. It is `aria-hidden`, `pointer-events-none`, perfectly still (no animation, so it respects §5.8), at 7% opacity in light and 10% in dark, and hidden when printing. Log rows, tiles and group headings sit on `bg-card/80` or `bg-background/70` surfaces with a light blur so body text keeps at least 4.5:1 contrast over it (checked in `.relayer/contrast.logs-backdrop.py`: lowest ratio 5.1).

**Per-page placements.** `lib/backdropPlacements.ts` is the single table (anchor offsets in `%`/`vh`/`vw`, size in vh, rotation, optional `flipX`); `PageBackdrop` builds its CSS from it. **All page dudes are the same size (120vh)**, the Logs dude's size; the search placements were re-tuned for it (checked by `placements.check.ts`). Logs stays bottom-right, -8°. Books: peeking in from the left edge, +10°. Music: bottom-left corner, -14°. Anime: upside down (180°) from the top edge, right of centre (shifted further right at 120vh so both eyes fit at 375px). Movies: rising from the bottom edge, centred, top half only, 0°. Games: on his side at the right edge (-90°, `flipX`, facing into the page).

**Eyes-visible rule.** On every search placement both eye pixels (grid row 5, columns 5 and 10) must land inside the content area (viewport minus the 240px sidebar at ≥ 1024px, the full width below) at 1280×800, 1920×1080 and 375×667. `eyePointsOnScreen(placement, viewport)` composes the same transform as the CSS (flip, then rotate, about the centre) and is checked in `.relayer/placements.check.ts`. Retune the table, never the check. Roots using it are `relative isolate overflow-hidden`; the layer is `-z-10`, so content paints above it.

**Use your own photo:** drop a file named `backdrop-<page>.jpg`, `.png` or `.webp` (page = `books`, `music`, `anime`, `movies`, `games`; Logs keeps `logs-backdrop.*`) into `client/src/assets/` and rebuild or restart the dev server. It replaces the dude on that page only, as a cover-fit, centred, 30% grayscale background at the same opacity. It is optional, resolved at build time (`import.meta.glob`), and not committed; don't add one to the repo.

**Turn it off:** Settings → Preferences → "Page backdrops (the giant blue dude)" turns off Logs and all search pages. The choice is stored per device in `localStorage` (`logs.backdrop`, default on), not synced to the server.

### 5.8 Things we will *not* do
Confetti, sound, cursor trails, parallax, animated backgrounds, mascot walking around the screen, emoji, rainbow anything, achievement popups, dark-mode stars.

---

## 6. Components: what changes

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

## 11. Suggested build order (fits 2 coding rounds)

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
- **Controls:** `ViewControls` without `groupOptions` shows only the List / Grid pill. It sits beside "Hide logged". The choice is stored per page as `search.view.books|music|anime|movies|games` (default List). Paging, Hide logged, empty / loading / error states and backdrops are unchanged.
- **Load more…** (Logs and Your media, `hooks/useGroupReveal.ts`, `components/media-view/GroupFooter.tsx`, helpers in `lib/logView.ts`): each group shows its first 5 rows / 12 tiles (the unlabelled "None" group: 20 rows / 24 tiles). A pill under the group reads "Load more… (N more)", reveals the same number again, and disappears when everything is shown. Counts are kept per group key and reset when the search, filters, sorts, group mode or view change; editing or deleting an item keeps them. The button is a real `<button>` with `aria-label="Load more {group}, {N} more"`; after a reveal, focus moves to the first newly shown row or tile (`tabIndex={-1}` on `<li>` only for that).
- **Load all and Collapse** (task 20): the footer is one `flex flex-wrap gap-2` row of pills. "Load all (N)" (N = the group's total) shows while items remain and more than one step remains (otherwise Load more already does it). "Collapse" (`ChevronsUp` + text) shows once the group is expanded (shown > initial) and resets only that group to its initial count. While expanded, the group's heading row is `sticky top-0 z-10` inside the page's `overflow-y-auto` scroll container (frosted `bg-background/70 backdrop-blur-sm`, full width) with a Collapse pill on the right; the group "None" gets a bar with only the pill. Collapsing scrolls the group's heading into view (`behavior: "auto"` under reduced motion, else `"smooth"`) and focuses it (`<h2 tabIndex={-1}>`; for "None", the first item). Rows, tiles and headings carry `scroll-mt-14` so focus and scrolling never hide them under the sticky row. Load more and Load all focus the first newly revealed item. `aria-label`s: "Load all {group}, {N} items", "Collapse {group}" (group name left out for None). Reset rules are unchanged.
