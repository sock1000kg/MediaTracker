# Architectural Decisions & Quirks

This document records deliberate design decisions, constraints, and provider quirks across `media-tracker`. It serves to explain behaviors that might look unexpected or confusing at first glance.

---

## 1. Per-User Provider Keys (No Server Env Fallback)

- **Code:** `server/src/services/apiKeyService.ts`, `server/src/services/search/tmdbSearchService.ts` (`getUserApiKey`), `server/src/services/search/rawgSearchService.ts` (`getUserApiKey`), `server/src/services/search/lastFmSearchService.ts` (`getUserApiKey`), `server/src/services/search/bggSearchService.ts` (`getUserApiKey`).
- **Context & Why:** All external metadata provider API keys (TMDB, RAWG, Last.fm, BoardGameGeek) are configured per user in user settings and encrypted at rest in the database. There is **no fallback** to server environment variables. An earlier fallback for Last.fm was removed because API keys represent individual client applications under distinct provider rate limits and terms of service. Sharing a single server-wide key across multiple untrusted users risks account termination, quotas exhaustion, and privacy leaks.

---

## 2. UUID v7 Identifiers (Never Sorted by ID Alone)

- **Code:** `server/src/prisma/schema.prisma` (`@default(uuid(7))`), `server/src/repositories/` (`mediaRepository.ts`, `logsRepository.ts`).
- **Context & Why:** Entities use UUID v7 to maintain temporal locality in PostgreSQL B-tree indexes, improving insert and lookup performance over random UUID v4. However, application queries should **never order by `id` alone** when chronological or creation ordering is required. Sub-millisecond generation batches or slight NTP clock variations can yield non-strictly-increasing IDs. Always order explicitly by `created_at`, `logged_at`, or `updated_at`, utilizing `id` strictly as a deterministic tie-breaker.

---

## 3. Statuses: Four Lowercase Canonical Values

- **Code:** `server/src/schemas/logSchemas.ts`, `server/src/utilities.ts` (`sanitizeStatus`), `client/src/lib/logStatus.ts`.
- **Context & Why:** All log statuses across the entire system are strictly normalized to four lowercase tokens:
  - `completed`
  - `in progress`
  - `wishlist`
  - `dropped`
  External import sources (Letterboxd, Goodreads, MyAnimeList) and UI selectors map their various source statuses into these canonical values upon intake.

---

## 4. TMDB 6-Month Refresh and Purge Rules

- **Code:** `server/src/services/mediaRefreshService.ts`, `server/src/queue/handlers/tmdbRefresh.ts`, `server/src/services/search/tmdbSearchService.ts`.
- **Context & Why:** Media metadata fetched from TMDB is cached indefinitely to minimize external API consumption. A refresh is only attempted if `refreshCheckedAt` is older than 6 months (180 days). If TMDB reports that an item was deleted or returns a 404, the record is **not hard-deleted** (hard deletes would cascade and delete user history/logs). Instead, the item is stamped with `purgedAt`, freezing its metadata while keeping user logs intact and preventing subsequent refresh queue jobs.

---

## 5. BoardGameGeek (BGG) Data Stored Exactly as Received

- **Code:** `server/src/services/search/bggSearchService.ts`, `server/src/schemas/search/bggSchemas.ts`.
- **Context & Why:** BoardGameGeek's XMLAPI2 provides rich, nested board game structures (player counts, recommended player counts, playtimes, primary and alternate titles, categories, mechanics). Rather than discarding fields in an aggressive lossy normalization, BGG responses are preserved faithfully in media metadata as received from the API, ensuring detailed game specs remain available to the client without requiring repeat network roundtrips.

---

## 6. Music Covers from Cover Art Archive Release Groups, Not Last.fm

- **Code:** `server/src/services/search/musicBrainzClient.ts` (`fetchCoverArtArchiveCover`), `server/src/queue/handlers/musicCoverBackfill.ts`.
- **Context & Why:** Album artwork is retrieved directly from the Cover Art Archive (`coverartarchive.org/release-group/{mbid}/front`) rather than Last.fm. Last.fm album images frequently suffer from inconsistent licensing constraints, low resolution, or missing dimensions. The Cover Art Archive is open, community-curated, reliably keyed by MusicBrainz release-group UUIDs, and provides high-resolution front covers.

---

## 7. MusicBrainz Shared 1 req/s Limiter & "Failure Never Erases"

- **Code:** `server/src/services/search/musicBrainzClient.ts`.
- **Context & Why:** MusicBrainz enforces strict rate limits (no more than 1 request per second per IP, with a mandatory meaningful `User-Agent`). All MusicBrainz client requests share a single in-process `RateLimiter` instance.
  Furthermore, the rule **"failure never erases"** is enforced: if an external MusicBrainz query times out, fails, or cannot locate updated cover art, existing media covers and metadata are preserved untouched. The entity's `coverResolvedAt` or `mbSyncedAt` timestamp is updated to record that resolution was attempted, avoiding infinite backfill retry loops while guaranteeing data is never wiped by transient network failures.

---

## 8. Last.fm Search Ranking & MusicBrainz Canonical Data

- **Code:** `server/src/services/search/lastFmSearchService.ts` (`MusicSearchService`, `musicSearchService`), `server/src/services/search/musicBrainzClient.ts`.
- **Context & Why:** MusicBrainz is the authoritative source for tracklists, album release dates, artists, and MBID linkages. However, MusicBrainz lacks global popularity metrics, making naive search queries return obscure bootlegs before iconic albums. Last.fm is queried to supply scrobble counts and listener statistics used strictly to rank and order MusicBrainz search results. Additionally, Last.fm user tags serve as a fallback genre source when MusicBrainz release tags are empty.

---

## 9. Comics Support Removed

- **Code:** `server/src/prisma/schema.prisma`, `client/src/pages/sections/`.
- **Context & Why:** Comic book tracking was originally considered but was explicitly removed from the codebase. Comic metadata providers (e.g. Comic Vine) have restrictive API policies, spotty free tiers, and massive semantic overlap with Manga. To keep the schema and user experience focused and maintainable, media tracking centers on books, movies, tv, anime, manga, video games, music, and board games.

---

## 10. AniList Sync Dropped

- **Code:** Dropped task documentation (`.relayer/dropped/task43-anilist-sync.md`), `server/src/services/search/anilistSearchService.ts`.
- **Context & Why:** Full two-way AniList synchronization was evaluated and deliberately dropped. Full sync requires complex OAuth2 credential handling, continuous polling/webhooks, and token renewals with strict rate-limit hazards. The system instead supports fast, unauthenticated AniList search for manual logging, alongside file-based import for MyAnimeList XML exports.

---

## 11. Demo Account Restrictions & Weekly Reset

- **Code:** `server/src/services/demoService.ts` (`ensureNotDemo`, `resetDemoUser`), `server/src/queue/handlers/demoReset.ts`, `server/scripts/build-demo-fixture.ts`.
- **Context & Why:** The demo account (`demo` / `demoPassword123`) exists for public preview without registration. To protect the deployment:
  - Demo users cannot alter passwords, modify email/account credentials, or manage real API keys (guarded via `demoService.ensureNotDemo`).
  - A scheduled weekly reset wipes demo logs and resets the demo user's state to a deterministic baseline (`server/src/tests/fixtures/demo/demo-media.json`).

---

## 12. Seeds Run on Every Start (and Two-Replica Seed Race)

- **Code:** `server/src/server.ts`, `server/src/tests/seed.ts`.
- **Context & Why:** The database seed script executes on backend startup to ensure default media types (book, movie, tv, game, music, anime, manga, boardgame) and system users are populated. When scaling to multiple backend replicas (e.g., in container orchestration), both instances may invoke the seed concurrently. The seeding logic is idempotent and tolerates unique constraint collisions on initialization.

---

## 13. Shared Search Architecture

- **Code:**
  - `client/src/components/search/SearchPageShell.tsx`
  - `client/src/components/search/SearchHeader.tsx`
  - `client/src/components/search/SearchResults.tsx`
  - `client/src/components/search/ProviderAttribution.tsx`
  - `client/src/hooks/useProviderSearch.ts`
  - `client/src/hooks/useSearchLogging.tsx`
  - `client/src/hooks/useHideLogged.ts`
- **Context & Why:** Search interfaces for movies, TV shows, video games, board games, and music follow a unified structural pattern. This shared hierarchy separates layout, debounced input query handling, grid virtualization, "Hide logged" state management, and logging modals. Maintaining this standard avoids UI divergence and duplicate logic across search sections.

---

## 14. Data-Driven API Keys Form

- **Code:** `client/src/forms/ApiKeysForm.tsx`.
- **Context & Why:** The API key management view in the user settings UI is driven by a provider specification schema rather than hardcoded inputs. Each provider item specifies its service identifier, user-friendly label, link to obtain a free key, and validation hint. Adding new external providers only requires adding an entry to this configuration table.

---

## 15. No-AI-on-Provider-Data Rule

- **Reference:** [client/public/docs/providers.html](../client/public/docs/providers.html), `server/src/services/search/`.
- **Context & Why:** Terms of Service across third-party media data providers (TMDB, RAWG, Last.fm, MusicBrainz, BoardGameGeek, Open Library) strictly prohibit using their data to train, fine-tune, or feed generative AI models without prior contractual agreements. The application strictly forbids sending provider metadata or cached records to LLMs or generative services.

---

## 16. Goodreads Books Store Open Library Data, Synced in the Background

- **Code:** `server/src/services/imports/goodreadsImportService.ts`, `server/src/services/openLibrarySyncService.ts`, `server/src/queue/handlers/openLibrarySync.ts`.
- **Context & Why:** Goodreads CSV exports do not contain book genres or rich metadata. Previously, inline Open Library enrichment was attempted per-row during CSV import, which slowed down imports and performed unbatched single-item searches. Furthermore, Open Library's API terms request that clients avoid hundreds of individual requests and instead batch queries through `search.json` (e.g. `q=isbn:(A OR B OR ...)`). Following the music pattern, Goodreads imports store only Goodreads identity (title, author, year, Goodreads external ID and URL) instantly without network calls. A background rate-limited job (`openlibrary.sync`) then fills in canonical Open Library data (cover, genres, publisher, page count, work key) in efficient ISBN batches and title/author fallbacks. Stored Goodreads source and link are preserved for de-duplication and linking.

---

## 17. Dynamic Provider Links (Built from IDs, Not Stored)

- **Code:** `client/src/lib/providers.ts`, `client/src/lib/providerLinks.ts`, `server/src/api/domain/media.ts`.
- **Context & Why:** Outbound links to external provider web pages (TMDB, RAWG, Open Library, MusicBrainz, Last.fm, BoardGameGeek, AniList, Goodreads) are dynamically synthesized on the client from provider IDs (e.g. `sourceId`, `metadata.imdbId`, `metadata.workKey`, `metadata.releaseGroupId`, etc.). New media records do not persist `metadata.url` in the database. Building links from IDs guarantees that URL scheme changes or domain migrations don't require database migrations, and removes redundant URL data from stored metadata. Older records with stored URLs continue to use them as a fallback if IDs are missing.

