# API reference

Base URL: the API origin (e.g. `http://localhost:5000`). Bodies are JSON unless noted otherwise.

**Identifiers:** Every database surrogate ID and foreign key (`id`, `userId`, `mediaId`, `logId`, `parentId`, `mediaTypeId`, `collectionId`, `tagId`) is a canonical UUID string (UUIDv7 for new records). Path parameters representing IDs (`/logs/:id`, `/collections/:id`, `/tags/:id`, `/media/:id`, `/media/:id/children`, `/collections/:id/items/:logId`) validate as UUIDs and return `400` with an error payload when malformed.

**Authentication:** every endpoint except `/auth/*`, `/healthz`, and `/config` needs `Authorization: Bearer <access token>`.
- Access tokens last 15 minutes.
- The refresh token is a rotating, HttpOnly `refreshToken` cookie (7 days). Call `POST /auth/refresh` with credentials included to get a new access token.

**Errors** are `{ "message": string }` with a matching status:
- `400`: validation, malformed UUID, or "not available on the demo account"
- `401`: missing or expired access token
- `403`: forbidden, or a wrong current password
- `404`
- `409`
- `413`: payload too large
- `429`: rate limited
- `502` / `503` / `504`: an upstream search provider failed, was unreachable or timed out

## Health

| Method | Path | Description |
| --- | --- | --- |
| GET | `/healthz` | Liveness and database check |

## Config

| Method | Path | Description |
| --- | --- | --- |
| GET | `/config` | Public application configuration and client limits (`Cache-Control: public, max-age=3600`). Returns `{ limits: { notes, tags, collections, imports, search }, demo: { username, password } | null }` (`demo` is filled only when `PUBLIC_DEMO=true` and `DEMO_USER_PASSWORD` is set). |

## Auth

| Method | Path | Description |
| --- | --- | --- |
| POST | `/auth/register` | `{ username, password, displayName, registerKey }`. Returns `{ accessToken, user }` and sets the refresh cookie. Rate-limited. |
| POST | `/auth/login` | `{ username, password }`. Returns `{ accessToken, user }` and sets the refresh cookie. Rate-limited. |
| POST | `/auth/refresh` | Uses the refresh cookie. Returns `{ accessToken }` and rotates the cookie. |
| POST | `/auth/logout` | Revokes the refresh token and clears the cookie (`204`). |

## Current user (`/users/me`)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/users/me` | `{ id, username, displayName, created_at, preferences }` |
| PATCH | `/users/me` | `{ displayName }`. Not available on the demo account. |
| PUT | `/users/me/password` | `{ currentPassword, newPassword }`. Returns `{ accessToken }` and a new refresh cookie, and signs out other sessions. A wrong current password gives `403`. Rate-limited. |
| GET | `/users/me/preferences` | The preferences object. |
| PATCH | `/users/me/preferences` | A partial update. A top-level `null` removes a key, and `hideLogged` / `defaultSort` merge by sub-key. Max 4 KB. |
| GET | `/users/me/export?format=json\|csv` | A download of your logs, media, media types and collections (no ids, passwords or API keys). JSON includes each log with its `entries: [{ startedAt, finishedAt, progressEpisodes, progressChapters, progressVolumes, name, note, edition }]` (no `title` or `displayTitle` on the log). CSV has one row per entry (with the log's fields repeated; a log without entries is one row with empty entry columns); columns are `title,creator,year,type,provider,provider_id,status,rating,notes,logged_at,entry_name,entry_started_at,entry_finished_at,entry_note,edition_format,edition_language,categories,tags,collections,url` and spreadsheet-safe. |
| DELETE | `/users/me` | `{ password, confirmUsername }`. Deletes the account and everything it owns (`204`). Rate-limited. |

The preferences shape (every key is optional):

```json
{
  "theme": "light | dark | system",
  "defaultTab": "logs | medias | collections | mediaTypes | stats | settings | bookSearch | musicSearch | animeSearch | movieSearch | tvSearch | gameSearch",
  "hideLogged": { "books": true, "music": false, "anime": false, "movies": false, "tv": false, "games": false },
  "defaultSort": { "logs": [{ "field": "date", "direction": "desc" }], "medias": [] }
}
```

## Media types

| Method | Path | Description |
| --- | --- | --- |
| GET | `/media-type` | Your media types plus the built-in ones (book, music, anime, manga, movie, tv, game, boardgame). |
| POST | `/media-type` | Create a custom type. |
| PUT | `/media-type/:name` | Rename one of your types. |
| DELETE | `/media-type/:name` | Delete one of your types. |

## Media

| Method | Path | Description |
| --- | --- | --- |
| GET | `/media` | The media you created yourself. |
| POST | `/media` | Create custom media (`title`, `mediaType`, optional `creator`, `year`, `description`, `imageUrl`, `details`, `subtype`, `releaseDate`). Specifying `provider` or `providerId` returns `400`. |
| PUT | `/media/:id` | Update your own media. Specifying `provider` or `providerId` returns `400`. |
| DELETE | `/media/:id` | `{ confirm }`. Without `confirm: true` it returns a warning with the number of logs that would be deleted. |
| GET | `/media/:id/children` | Direct children of an album or show (tracks or seasons). Each child's `log` includes `entryCount` and its newest entry. |
| POST | `/media/:id/refresh` | Re-fetches provider details using the requesting user's key where required, updating only provider fields (title, original title, year, creator, description, image, details, subtype, releaseDate, genres, external ids). Allowed when the user has logged the item (or its parent/child). Rate-limited to once per 10 minutes per item (`429`). Custom media returns `400`. For Goodreads items, if the matched Open Library work is already held by another row, merges into it and returns `200` with `{ media, mergedInto: string }`. |
| PUT | `/media/media-log` | `{ mediaData, logData, entry?, parent? }`. Logs a search result: it creates or reuses the media (matched through external id lookup). If the user has no log: creates the log with `entry` as its first entry. If they already do: updates the log fields sent and adds `entry` as a new entry if sent (never overwrites an existing entry). Returns `{ log, media, logCreated: boolean, entryCreated: boolean }`. Some sources are enriched the first time they're logged: Last.fm tags, TMDB director/runtime/genres, and RAWG developers/description. |

## Logs

| Method | Path | Description |
| --- | --- | --- |
| GET | `/logs` | Your logs, each with its media, media type, `entryCount`, `entries: LogEntry[]` (newest first), `collectionIds: string[] (UUIDs)`, and `tags: [{ id: string (UUID), name }]` sorted by name. The old top-level `started_at`, `finished_at`, and `progress*` columns are removed from the log. |
| POST | `/logs` | `{ mediaId: string (UUID), status, rating, notes, tags, entry? }`. A `title` key is rejected (`400`): a log has no name of its own, its entries do. Creates the log. If `entry` (`name`, `startedAt`, `finishedAt`, `progressEpisodes`, `progressChapters`, `progressVolumes`, `note`, `edition: { format?, language? }`) is given, it is created as the first entry. Maximum 1 log per user per media (`409`). |
| PUT | `/logs/:id` | `{ status?, rating?, notes?, tags?, entries? }`. The log's fields, and optionally an `entries` object `{ create?: EntryInput[], update?: (EntryInput & { id })[], delete?: string[] }` that runs in the **same transaction** (order: delete, update, create; any failure rolls everything back, including the log fields). Each entry is validated like the single-entry routes (dates not in the future, finish ≥ start, note ≤ 10,000, name ≤ 300); an id that is not this log's entry returns `404` and nothing changes; the 100-entry cap is checked on the final count (`400`). When the body has an `entries` key, no automatic status entries are applied (the client has already staged them); without it, status automation runs as before. Responds with the full updated log, shaped like `GET /logs`. A `title` key or date/progress fields in the body return `400` (`"Dates belong to an entry"` for the latter). `tags` has set semantics. Malformed `:id` returns 400. |
| DELETE | `/logs/:id` | Delete a log. Entries cascade. Malformed `:id` returns 400. |
| POST | `/logs/:id/entries` | `{ name?, startedAt?, finishedAt?, progressEpisodes?, progressChapters?, progressVolumes?, note?, edition? }` (`name` ≤ 300; `edition` is `{ format?, language? }`, strict). Creates a new entry for the log. Verifies log ownership, checks the 100-entry limit (`400`), validates dates and strict `edition` schema. Returns `201` with `{ entry, log }`. |
| PUT | `/logs/:id/entries/:entryId` | `{ name?, startedAt?, finishedAt?, progressEpisodes?, progressChapters?, progressVolumes?, note?, edition? }`. Edits an entry. Returns `200` with `{ entry, log }`. |
| DELETE | `/logs/:id/entries/:entryId` | Deletes an entry (`200`). Returns updated `{ log }`. |

## Tags

| Method | Path | Description |
| --- | --- | --- |
| GET | `/tags` | Your personal tags, each with its log usage count (`[{ id: string (UUID), name, count }]`), sorted by name case-insensitively. |
| POST | `/tags` | `{ name }`. Create a new tag (1–40 chars, no commas, leading `#` stripped). Returns `201` with `{ id: string (UUID), name }`. If a tag with the same normalised name already exists, returns `409` with the existing tag. |
| PATCH | `/tags/:id` | `{ name }`. Rename a tag. Changing case of the same tag is allowed; colliding with another of your tags returns `409`. Non-existent or other user's tag returns `404`. Malformed `:id` returns 400. |
| DELETE | `/tags/:id` | Delete a tag (`204`). Cascades to remove the tag from all of your logs. Malformed `:id` returns 400. |

## Collections

Collections are private, ordered lists of your logs. Up to 200 collections per user, up to 1000 items per collection.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/collections` | Your collections (`[{ id: string (UUID), name, description, ranked, count, updated_at, covers: string[] }]`), sorted by `updated_at` descending. `covers` has up to 4 image URLs from the first items. |
| POST | `/collections` | `{ name, description?, ranked? }`. Create a collection. Name is 1–80 characters, unique per user case-insensitively (collision gives `409` with existing collection id). `ranked` defaults to `false`. Returns `201`. |
| GET | `/collections/:id` | The collection plus `items: [{ position, added_at, log }]`, ordered by dense position starting from 0. `log` has the full log shape including media, tags, and `collectionIds`. Other users' collections return `404`. Malformed `:id` returns 400. |
| PATCH | `/collections/:id` | `{ name?, description?, ranked? }`. Update a collection. Name collision gives `409`. Returns `200`. Malformed `:id` returns 400. |
| DELETE | `/collections/:id` | Delete a collection (`204`). The logs themselves are untouched. Malformed `:id` returns 400. |
| POST | `/collections/:id/items` | `{ logId: string (UUID) }`. Append a log at the end (`position = count`). Already in collection gives `409`. Adding another user's log gives `404`. Bumps collection `updated_at`. Returns `201`. Malformed `:id` returns 400. |
| DELETE | `/collections/:id/items/:logId` | Remove a log from the collection (`204`). Remaining items have positions re-densified (0, 1, 2, …). Bumps collection `updated_at`. Malformed `:id` or `:logId` returns 400. |
| PUT | `/collections/:id/order` | `{ logIds: string[] (UUIDs) }`. Reorder items. `logIds` must be an exact permutation of current items (otherwise `400`). Rewrites positions and bumps collection `updated_at`. Returns `200`. Malformed `:id` returns 400. |

## Letters

"Letters to later": a private note on one of your logs, sealed until **either** a date (`opensAt`) **or** the next time you log the item again (`opensOnRelog`). The server never sends the text of a letter that hasn't been opened. There is no edit route.

An item is `{ id, logId, media: { id, title, mediaType }, created_at, opensAt, opensOnRelog, openedAt, state, body? }`, where `state` is `"sealed" | "ready" | "opened"` and `body` is present only when `state` is `"opened"`. A letter is **ready** when it hasn't been opened and either `opensAt` has passed, or `opensOnRelog` is set and the log has an entry created after the letter.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/letters` | All your letters, newest first. |
| GET | `/letters/summary` | `{ sealed, ready, nextOpensAt }`. `sealed` excludes ready ones; `nextOpensAt` is the earliest `opensAt` among sealed letters, or `null`. |
| POST | `/letters` | `{ logId, body, opensAt?, opensOnRelog?, today? }`, exactly one of `opensAt` (`YYYY-MM-DD`) and `opensOnRelog: true`. `opensAt` must be after `today` and at most 25 years ahead. `today` is the writer's local date, used when it is within a day of the server's UTC date (otherwise the UTC date counts). `body` is 1–10,000 characters. At most 5 unopened letters per log and 500 letters per user (`400`). Another user's log gives `404`. Returns `201` without `body`. |
| POST | `/letters/:id/open` | The item with `body`; sets `openedAt` the first time. `409` while still sealed, `404` for another user's letter. Opening again returns it. |
| DELETE | `/letters/:id` | Tear it up, in any state (`204`). |

Deleting a log deletes its letters; merging duplicate items moves them to the surviving log. Logs from `GET /logs` (and inside `GET /collections/:id`) carry `letters: { sealed, ready }` counts. The JSON account export lists each log's letters, with `body` only for opened ones; the CSV export has no letters.

## API keys (for search providers)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api-key` | Your stored keys. They're encrypted at rest. |
| POST | `/api-key` | `{ service, key }`. The `service` must be one of `ApiKeyService` (`lastfm`, `tmdb`, `rawg`, `bgg`); any unknown or unkeyed service returns `400`. Keys can be up to 512 characters. |
| PUT | `/api-key` | `{ service, key }`. Replace a key for a valid `ApiKeyService` (`400` if unknown). |
| DELETE | `/api-key` | `{ service }`. Delete a key for a valid `ApiKeyService` (`400` if unknown). |

## Search

All search endpoints take `q` (required) and `page` (default 1), and return `{ results: SearchResult[], nextStartIndex: number | null }`.

| Method | Path | Provider | Extra parameters |
| --- | --- | --- | --- |
| GET | `/search/books` | Open Library | `author`, `subject`, `language` (ISO 639-2, e.g. `eng`), `yearFrom`, `yearTo`, `sort` = `relevance \| new \| old \| rating` |
| GET | `/search/music/albums` | MusicBrainz & Last.fm (key) | none |
| GET | `/search/music/tracks` | MusicBrainz & Last.fm (key) | none |
| GET | `/search/music/albums/tracks` | MusicBrainz & Last.fm | `sourceId`, `provider`, `title`, `creator` — returns tracklist for an album; tracks include `inLibrary` and `myLog` (including `entryCount` and rating) |
| GET | `/search/anime` | AniList | `type` = `tv \| movie \| ova \| special \| ona \| music`, `sort` = `relevance \| score \| popularity \| newest` |
| GET | `/search/manga` | AniList | `type` = `manga \| novel \| lightnovel \| oneshot \| manhwa \| manhua`, `sort` as for anime |
| GET | `/search/movies` | TMDB (key) | `year` |
| GET | `/search/games` | RAWG (key) | `platform` = `pc \| playstation \| xbox \| nintendo \| ios \| android \| mac \| linux`, `sort` = `relevance \| rating \| newest \| metacritic` |
| GET | `/search/boardgames` | BoardGameGeek (per-user token) | none |

A search that needs a key and has none returns `404` ("Missing … API Key"). A key the provider rejects returns `400`, never `401`.

`SearchResult` looks like this:

```json
{
  "title": "Dune", "creator": "Frank Herbert", "year": "1965",
  "description": "…", "imageUrl": "https://…",
  "source": "open_library", "sourceId": "OL…",
  "details": { "categories": ["Science fiction"] }
}
```

The `details` field varies by media type and provider. For example: `pageCount`, `publisher`, `episodes`, `score` (0–100 on AniList, 0–10 on MAL/TMDB, 0–5 on RAWG), `scoreScale` (`anilist` or `mal`), `platforms`, `metacritic`, `minPlayers`, `maxPlayers`, `playingTime`, `bggRating`. For music, `subtype` indicates `album` or `track`; for TV, `subtype` indicates `show` or `season`.

## Imports and jobs

| Method | Path | Description |
| --- | --- | --- |
| POST | `/imports/goodreads` | `multipart/form-data` with `file` (a Goodreads CSV export, max 10 MB). It's checked up front, then queued: returns `202 { jobId }`. If an import is already running, returns `409 { message, jobId }`. Not available on the demo account. |
| POST | `/imports/mal` | `multipart/form-data` with `file` (a MyAnimeList anime or manga export in `.xml` or `.xml.gz`, max 10 MB). It's checked up front, then queued: returns `202 { jobId }`. If an import is already running, returns `409 { message, jobId }`. Not available on the demo account. |
| POST | `/imports/letterboxd` | `multipart/form-data` with `file` (a Letterboxd data export ZIP, max 10 MB). It's checked up front, then queued: returns `202 { jobId }`. If an import is already running, returns `409 { message, jobId }`. Not available on the demo account. |
| GET | `/jobs?name=import.goodreads&limit=10` | Your recent jobs, newest first (`limit` 1–20). Filter by `import.goodreads`, `import.mal`, or `import.letterboxd`. |
| GET | `/jobs/:id` | `{ id, name, status, progress, result, error, createdAt, finishedAt }`. `status` is `queued`, `active`, `completed` or `failed`, and `progress` is 0–100. Other users' jobs return `404`. |

A finished import's `result` is `{ imported, updated, skipped, failures: [{ row, title, reason }], failuresTruncated, notes, unmatched, liked, lists }`. Failures are capped at 500. Entries that had no AniList match are imported as bare MAL entries without covers and reported in `notes`. Letterboxd films that couldn't be matched to TMDB are imported by title and reported in `unmatched` and `notes`. Letterboxd likes are imported into the "Letterboxd likes" collection; lists are imported as collections (with films not otherwise logged imported as wishlist).
