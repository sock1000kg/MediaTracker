# AGENTS.md

A short, practical guide for coding agents and developers working on `media-tracker`.

---

## 1. Project Layout

- `server/`: Express + TypeScript backend, Prisma ORM, BullMQ / in-memory queues, external media search providers.
- `client/`: React 19 + TypeScript frontend with Vite, Tailwind CSS v4, TanStack Query, Radix UI primitives.
- `docs/`: System documentation, architecture, API reference, deployment notes, external provider guidelines, and architectural decisions (`docs/decisions.md`).

---

## 2. Dev Stack Execution

To start the local development stack:
```bash
docker compose --env-file server/.env -f docker-compose.yml -f docker-compose.dev.yml up
```
> **Note:** Plain `docker compose up` fails because Docker Compose requires variable interpolation (`${POSTGRES_USER}`, `${POSTGRES_PASSWORD}`, `${POSTGRES_DB}`) defined in `server/.env`. Always supply `--env-file server/.env`.

---

## 3. Running Tests and Resource Limits

The user's host machine runs out of memory when running suites concurrently.
- **Sequential execution only:** Always run the client and server test suites one after another, never in parallel.
- **Client test command:** Run Vitest with bounded workers:
  ```bash
  cd client && npx vitest run --maxWorkers 4
  ```
- **Test Database:** Tests expect the test PostgreSQL instance on `localhost:5433` (as defined in `server/.env.test` and spun up via `docker-compose.test-db.yml`).
- **Server test command:**
  ```bash
  cd server && NODE_ENV=test NODE_OPTIONS=--experimental-vm-modules npx jest --runInBand
  ```

---

## 4. EACCES `prisma generate` Build Fallback

If `npm run build` or `npx prisma generate` in `server/` fails with `EACCES: permission denied` on files inside `server/src/generated/` (which can happen when containerized builds generate Prisma models as root), use the build fallback that compiles TypeScript and copies test fixtures directly without re-running `prisma generate`:
```bash
cd server && npx tsc && npx tsc-alias && npx copyfiles -u 2 "src/tests/**/*csv" "src/tests/**/*json" "src/tests/**/*xml" "src/tests/**/*zip" -e "src/tests/fixtures/demo/exports/letterboxd-*-utc.zip" dist/tests/
```
Then run tests with:
```bash
NODE_ENV=test NODE_OPTIONS=--experimental-vm-modules npx jest --runInBand
```

---

## 5. Where Things Live

- **Search Providers & External Registry:**
  - Provider registry & rules: `server/src/providers/registry.ts`, `server/src/providers/providerFetch.ts`. To add a provider, add a registry entry first; refer to [`client/public/docs/providers.html`](client/public/docs/providers.html) for full provider rules and attribution specs.
  - Server providers: `server/src/services/search/` (TMDB for movies/TV, OpenLibrary for books, RAWG for video games, BoardGameGeek for board games, MusicBrainz / Last.fm for music).
  - Search routes & controllers: `server/src/api/routes/searchRoutes.ts`, `server/src/api/controllers/searchControllers.ts`.
  - Client search hooks: `client/src/hooks/useProviderSearch.ts`, `client/src/hooks/useSearchLogging.tsx`, `client/src/hooks/useHideLogged.ts`.
  - Client search UI sections: `client/src/pages/sections/*SearchSection.tsx`.
  - Client shared search components: `client/src/components/search/` (`SearchPageShell`, `SearchHeader`, `SearchResults`, `ProviderAttribution`).
  - Client provider links: `client/src/lib/providers.ts`, `client/src/lib/providerLinks.ts`.
- **Job Queue:**
  - Queue setup & BullMQ / Valkey driver: `server/src/queue/` (`bullmqQueue.ts`, `limits.ts`, `index.ts`).
  - Queue job handlers: `server/src/queue/handlers/` (`goodreadsImport.ts`, `malImport.ts`, `letterboxdImport.ts`, `tmdbRefresh.ts`, `musicCoverBackfill.ts`, `demoReset.ts`).
  - In-memory queue fallback for tests and development without Redis: `server/src/queue/memoryQueue.ts`.
- **Database Migrations:**
  - Prisma schema: `server/src/prisma/schema.prisma`.
  - Migrations: `server/src/prisma/migrations/`.
- **Log journal dialog (create/edit a log and its entries, one Save):**
  - Dialog: `client/src/components/logs/LogJournalDialog.tsx` (entry cards: `EntryCard.tsx`; staged state and status rules: `client/src/lib/journalDraft.ts`). Used by the Logs page, collections, Media page, search results (`useSearchLogging.tsx`) and expanded album/season children (`useExpandedChildren.tsx`).
  - Atomic save: `PUT /logs/:id` with an `entries` object, `server/src/services/logService.ts`.
- **Seed & Demo Fixture:**
  - Database seed logic: `server/src/tests/seed.ts`.
  - Static demo fixture builder & JSON: `server/scripts/build-demo-fixture.ts`, `server/src/tests/fixtures/demo/demo-media.json`.
  - Demo reset handler & service: `server/src/queue/handlers/demoReset.ts`, `server/src/services/demoService.ts`.

---

## 6. Commit Style

- Use **Conventional Commits** format (e.g. `feat(client): ...`, `fix(server): ...`, `docs: ...`, `chore: ...`).
- **No attribution or co-author trailers** (do not append `Co-authored-by`, `Signed-off-by`, or AI assistant attributions).

---

## 7. Sensitive User Data & Exports

- **Never read, parse, or commit the user's original Letterboxd export files or personal data.**
- Only test with sanitized, mock test fixtures located in `server/src/tests/fixtures/` or synthetic test inputs.

---

## 8. Data Model & Media Schema Rules

- **Provider facts:** Stored in `Media.details`, validated strictly on write by per-subtype Zod schemas in `server/src/schemas/detailsSchemas.ts`. Unknown keys are rejected.
- **Identifiers:** External identifiers live only in `MediaExternalId` (and `Media.provider`/`providerId` on the canonical row). Never store external IDs in `Media.details`.
- **Subtypes:** Music tracks and albums, TV shows and seasons are identified by `Media.subtype` (`track`, `album`, `show`, `season`). Media types without subtypes leave `Media.subtype` null.
- **Bookkeeping timestamps:** Provider fetch and sync attempts use typed columns (`Media.syncedAt`, `Media.syncCheckedAt`, `Media.purgedAt`).
- **No sparse fact columns:** Never add individual sparse fact columns to `Media` or put IDs/duplicate columns into `Media.details`.
- **Log entries:** Dates (`startedAt`, `finishedAt`), progress (`progressEpisodes`, `progressChapters`, `progressVolumes`), per-entry notes and `edition` live on `LogEntry`, never on `UserLogs`. A `UserLogs` row represents the user's relationship with one item (status, one rating, review/notes, tags, collections); dated experiences are entries on that log.
- **Titles & newest entry helpers:** A log has no title of its own; logs show the item's title and each entry has a `name`. Use the newest-entry helper (`newestEntry`, `sortEntriesNewestFirst`) rather than inspecting raw entry dates directly.
- **Never add version-like media:** An item is whatever the provider counts as one item. Never split or join beyond that. Goodreads editions merge into their canonical Open Library work via `mergeMediaInto`.

---

## 9. Authentication & Tokens

- **Hashed Refresh Tokens:** Never store a raw refresh token; use the helper in `server/src/repositories/authRepository.ts` (`hashRefreshToken`) which stores and queries by SHA-256 hex (`tokenHash`).
- **API Key Service Enum:** API keys are strictly constrained by the `ApiKeyService` enum (`lastfm`, `tmdb`, `rawg`, `bgg`, `google_books`).

