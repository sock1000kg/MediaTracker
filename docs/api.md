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
| GET | `/config` | Public application configuration and client limits (`Cache-Control: public, max-age=3600`). Returns `{ limits: { notes, tags, collections, imports, search } }`. |

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
| GET | `/users/me/export?format=json\|csv` | A download of your logs, media, media types and collections (no ids, passwords or API keys). JSON includes `collections: [{ name, description, ranked, items: [{ position, title, type }] }]`. CSV columns are `title,creator,year,type,source,source_id,status,rating,notes,logged_at,started_at,finished_at,categories,tags,collections,url` and spreadsheet-safe. |
| DELETE | `/users/me` | `{ password, confirmUsername }`. Deletes the account and everything it owns (`204`). Rate-limited. |

The preferences shape (every key is optional):

```json
{
  "theme": "light | dark | system",
  "defaultTab": "logs | medias | collections | mediaTypes | stats | settings | bookSearch | musicSearch | animeSearch | movieSearch | gameSearch",
  "hideLogged": { "books": true, "music": false, "anime": false, "movies": false, "games": false },
  "defaultSort": { "logs": [{ "field": "date", "direction": "desc" }], "medias": [] }
}
```

## Media types

| Method | Path | Description |
| --- | --- | --- |
| GET | `/media-type` | Your media types plus the built-in ones (book, music, anime, manga, movie, game). |
| POST | `/media-type` | Create a custom type. |
| PUT | `/media-type/:name` | Rename one of your types. |
| DELETE | `/media-type/:name` | Delete one of your types. |

## Media

| Method | Path | Description |
| --- | --- | --- |
| GET | `/media` | The media you created yourself. |
| POST | `/media` | Create custom media (`title`, `mediaType`, optional `creator`, `year`, `description`, `imageUrl`, `metadata`). |
| PUT | `/media/:id` | Update your own media. |
| DELETE | `/media/:id` | `{ confirm }`. Without `confirm: true` it returns a warning with the number of logs that would be deleted. |
| PUT | `/media/media-log` | `{ mediaData, logData }`. Logs a search result: it creates or reuses the media (matched by `source` + `sourceId`) and creates the log in one transaction. `logData` accepts `status`, `rating`, `notes`, `startedAt`, `finishedAt`, and optional `tags: string[]`. Some sources are enriched the first time they're logged: Last.fm tags, the TMDB director/runtime/genres, and the RAWG developers/description. |

## Logs

| Method | Path | Description |
| --- | --- | --- |
| GET | `/logs` | Your logs, each with its media and media type, including `started_at`, `finished_at`, `collectionIds: string[] (UUIDs)`, and `tags: [{ id: string (UUID), name }]` sorted by name. |
| POST | `/logs` | `{ mediaId: string (UUID), status, rating, notes, startedAt, finishedAt, tags }`. `rating` is 0–100 (or `null`), and `status` is one of `completed`, `in progress`, `wishlist` or `dropped` (or `null`). `startedAt` and `finishedAt` are optional dates stored at day precision (noon UTC). When both are set, `finishedAt ≥ startedAt` (otherwise `400 "Finished date can't be before the start date"`), and neither may be more than 1 day in the future (`400`). `tags` is an optional list of tag names (0–20; unknown tags auto-created). |
| PUT | `/logs/:id` | `{ status, rating, notes, startedAt, finishedAt, tags }`. Omitting dates leaves them unchanged, and `null` clears them. `tags` has set semantics: when present, replaces the log's tags; omitting leaves them unchanged; `[]` clears them. Malformed `:id` returns 400. |
| DELETE | `/logs/:id` | Delete a log. Malformed `:id` returns 400. |

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

## API keys (for search providers)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api-key` | Your stored keys. They're encrypted at rest. |
| POST | `/api-key` | `{ service, key }`. The `service` is `lastfm`, `tmdb` or `rawg`. Keys can be up to 512 characters. |
| PUT | `/api-key` | `{ service, key }`. Replace a key. |
| DELETE | `/api-key` | `{ service }` |

## Search

All search endpoints take `q` (required) and `page` (default 1), and return `{ results: SearchResult[], nextStartIndex: number | null }`.

| Method | Path | Provider | Extra parameters |
| --- | --- | --- | --- |
| GET | `/search/books` | Open Library | `author`, `subject`, `language` (ISO 639-2, e.g. `eng`), `yearFrom`, `yearTo`, `sort` = `relevance \| new \| old \| rating` |
| GET | `/search/music/albums` | Last.fm (key) | none |
| GET | `/search/music/tracks` | Last.fm (key) | none |
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
  "metadata": { "url": "https://…", "categories": ["Science fiction"] }
}
```

The `metadata` field varies by provider. For example: `kind` (`album` / `track` / `anime` / `manga` / `movie` / `game` / `boardgame`), `pageCount`, `publisher`, `episodes`, `score` (0–100 on AniList, 0–10 on MAL/TMDB, 0–5 on RAWG), `scoreScale` (`anilist` or `mal`), `platforms`, `metacritic`, `minPlayers`, `maxPlayers`, `playingTime`, `bggRating`.

## Imports and jobs

| Method | Path | Description |
| --- | --- | --- |
| POST | `/imports/goodreads` | `multipart/form-data` with `file` (a Goodreads CSV export, max 10 MB). It's checked up front, then queued: returns `202 { jobId }`. If an import is already running, returns `409 { message, jobId }`. Not available on the demo account. |
| POST | `/imports/mal` | `multipart/form-data` with `file` (a MyAnimeList anime or manga export in `.xml` or `.xml.gz`, max 10 MB). It's checked up front, then queued: returns `202 { jobId }`. If an import is already running, returns `409 { message, jobId }`. Not available on the demo account. |
| POST | `/imports/letterboxd` | `multipart/form-data` with `file` (a Letterboxd data export ZIP, max 10 MB). It's checked up front, then queued: returns `202 { jobId }`. If an import is already running, returns `409 { message, jobId }`. Not available on the demo account. |
| GET | `/jobs?name=import.goodreads&limit=10` | Your recent jobs, newest first (`limit` 1–20). Filter by `import.goodreads`, `import.mal`, or `import.letterboxd`. |
| GET | `/jobs/:id` | `{ id, name, status, progress, result, error, createdAt, finishedAt }`. `status` is `queued`, `active`, `completed` or `failed`, and `progress` is 0–100. Other users' jobs return `404`. |

A finished import's `result` is `{ imported, updated, skipped, failures: [{ row, title, reason }], failuresTruncated, notes, unmatched, liked, lists }`. Failures are capped at 500. Entries that had no AniList match are imported as bare MAL entries without covers and reported in `notes`. Letterboxd films that couldn't be matched to TMDB are imported by title and reported in `unmatched` and `notes`. Letterboxd likes are imported into the "Letterboxd likes" collection; lists are imported as collections (with films not otherwise logged imported as wishlist).
