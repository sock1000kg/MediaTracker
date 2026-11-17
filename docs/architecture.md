# Architecture

```
Browser (React SPA) ──HTTPS──▶ Express API ──▶ PostgreSQL (Prisma)
        │                          │
        │                          ├──▶ Valkey ◀── BullMQ worker (in-process by default)
        │                          │
        │                          └──▶ Search providers: Open Library, Last.fm, AniList, TMDB, RAWG, BoardGameGeek
        └── access token in localStorage, refresh token in an HttpOnly cookie
```

## Server layout

The request flow is **route → controller → service → repository** (`server/src/`):

- `api/routes`, `api/controllers`: HTTP only. Parse the request, call a service, shape the response.
- `services/`: business rules. Validation goes through Zod schemas in `schemas/`, and errors are `AppError(message, status)`.
- `repositories/`: Prisma queries. They take an optional transaction client.
- `middleWare/`: auth (JWT), rate limiters, error handler, request logging.
- `queue/`: the job queue (below).
- `prisma/`: the schema and migrations. Migrations run on container start (`prisma migrate deploy`). Database access uses Prisma ORM 7 with `@prisma/adapter-pg` driver adapter, configured via `prisma.config.ts`, generating into `src/generated/prisma` and re-exported through `src/db.ts`.

## Data model (short version)

- **User**: owns logs, custom media, custom media types, API keys, refresh tokens and a `preferences` JSON.
- **Media**: title, creator, year, description, image, `source` + `sourceId` (where a search result came from), and a free-form `metadata` JSON (categories, page count, runtime, platforms, …).
  - Media logged from search or imports belongs to the internal **`system`** user, so everyone shares it.
  - Media created by hand belongs to its creator.
- **MediaType**: built-in types (book, music, anime, manga, movie, game, boardgame) belong to `system`. Users can add their own.
- **UserLogs**: one log per user per media, with status, rating (0–100), notes, `logged_at`, and optional `started_at` / `finished_at` stored at day precision (noon UTC) so time zones never flip the calendar day.
- **Tag / LogTag**: personal tags on logs (private per user, unique per user case-insensitively, at most 20 tags per log and 500 per user).
- **Collection / CollectionItem**: private, ordered lists of logs (owned by User, unique nameKey per user case-insensitively, optional description and ranked flag, at most 200 collections per user and 1000 items per collection; dense positions starting from 0, maintained on additions, removals and reorders).

Deleting a user cascades to everything they own. Shared `system` media is never deleted.

## Search providers

Each provider lives in `services/search/*SearchService.ts`, and they share the same shape:
- **Pure, tested helpers:** a URL builder and a result mapper.
- **Responses:** validated against Zod schemas and mapped to a common `SearchResult`.
- **Request limits:** a per-attempt timeout, with one retry on `429`.
- **Error mapping:** a missing user key gives `404`, a rejected key gives `400` (never `401`, which the client treats as an expired session), a provider failure gives `502`, a provider rate limit or outage gives `503`, and a timeout gives `504`.
- **Keys:** Last.fm, TMDB, RAWG, and BoardGameGeek use the user's own API key/token (`UserAPIKey`, encrypted with `API_KEY_SECRET`; token from boardgamegeek.com/applications). Open Library and AniList need none. AniList calls are throttled to stay under its public rate limit (existing Jikan data is still supported).
- **Log-time enrichment:** some details are fetched once, the first time a result is logged, and stored on the shared media:
  - Last.fm top tags (junk tags removed)
  - the TMDB director, runtime and genres
  - the RAWG developers, publishers and description

  Enrichment failures never block the log.

## Background jobs

`server/src/queue/` defines a typed job registry (`JobPayloads`) and a `JobQueue` interface with two drivers:
- **`bullmq`:** BullMQ on Valkey. Used whenever `REDIS_URL` is set, and required in production.
- **`memory`:** in-process. Used for tests and Valkey-less local dev.

Jobs:
- `import.goodreads`: imports a Goodreads CSV and reports progress (0–100). New logs take `logged_at` from Date Read, then Date Added, then now.
  - One import runs per user at a time.
  - The uploaded CSV is removed from the queue once the job finishes.
- `demo.reset`: resets the demo account. Scheduled weekly with an idempotent job scheduler, so it runs once even with several instances.

Users see their jobs through `GET /jobs` and `GET /jobs/:id`, and only their own. The worker runs in the API process by default (`QUEUE_WORKER=true`).

## Authentication

- **Login and register:** return a short-lived access token (JWT, 15 minutes) and set a rotating refresh token (JWT, 7 days, stored server-side) in an HttpOnly, SameSite=Lax cookie. The cookie is `Secure` in production.
- **Rotation:** `POST /auth/refresh` swaps the refresh token for a new one. A token that has already been rotated is rejected, without clearing the newer cookie.
- **The client (`client/src/api/clientWrapper.ts`)** retries a `401` once after a refresh. Refreshes are **single-flight**, within a tab and across tabs (Web Locks), so several requests that fail at once trigger exactly one refresh.
- **Password change:** signs out other sessions. Account deletion needs the password and the username typed in.

## Frontend

- **Data:** TanStack Query handles fetching and caching. The cache is cleared on login and logout.
- **Pages:** `pages/sections/*` are the tabs inside `Homepage.tsx`: Logs, Your media, Media types, Stats, five searches and Settings.
- **Stats:** computed client-side from `GET /logs` (`lib/stats.ts`); there is no stats endpoint.
- **Shared view pieces:** `components/media-view/` holds `Cover`, `RowShell`, `TileShell`, `ClampText`, `GroupHeading`, `GroupFooter`, `ViewControls` and `PageBackdrop`. They're used by `components/logs`, `components/media` and `components/search`.
- **Preferences:**
  - Synced through `/users/me/preferences`: theme, start tab, hide-logged per search page, default sorts.
  - Kept per device in localStorage: the view (list/grid), the grouping and the backdrop toggle.
- **Design:** the tokens, typography, mascot and UI rules are in [`client/DESIGN.md`](../client/DESIGN.md).
