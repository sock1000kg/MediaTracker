# API reference

Base URL: the API origin (e.g. `http://localhost:5000`). Bodies are JSON unless noted otherwise.

**Authentication:** every endpoint except `/auth/*` and `/healthz` needs `Authorization: Bearer <access token>`.
- Access tokens last 15 minutes.
- The refresh token is a rotating, HttpOnly `refreshToken` cookie (7 days). Call `POST /auth/refresh` with credentials included to get a new access token.

**Errors** are `{ "message": string }` with a matching status:
- `400`: validation, or "not available on the demo account"
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
| GET | `/users/me/export?format=json\|csv` | A download of your logs, media and media types (no ids, passwords or API keys). CSV is one row per log and is spreadsheet-safe. |
| DELETE | `/users/me` | `{ password, confirmUsername }`. Deletes the account and everything it owns (`204`). Rate-limited. |

The preferences shape (every key is optional):

```json
{
  "theme": "light | dark | system",
  "defaultTab": "logs | medias | mediaTypes | settings | bookSearch | musicSearch | animeSearch | movieSearch | gameSearch",
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
| PUT | `/media/media-log` | `{ mediaData, logData }`. Logs a search result: it creates or reuses the media (matched by `source` + `sourceId`) and creates the log in one transaction. Some sources are enriched the first time they're logged: Last.fm tags, the TMDB director/runtime/genres, and the RAWG developers/description. |

## Logs

| Method | Path | Description |
| --- | --- | --- |
| GET | `/logs` | Your logs, each with its media and media type. |
| POST | `/logs` | `{ mediaId, status, rating, notes }`. `rating` is 0–100 (or `null`), and `status` is one of `completed`, `in progress`, `wishlist` or `dropped` (or `null`). |
| PUT | `/logs/:id` | `{ status, rating, notes }` |
| DELETE | `/logs/:id` | Delete a log. |

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
| GET | `/search/anime` | Jikan | `type` = `tv \| movie \| ova \| special \| ona \| music`, `sort` = `relevance \| score \| popularity \| newest` |
| GET | `/search/manga` | Jikan | `type` = `manga \| novel \| lightnovel \| oneshot \| manhwa \| manhua`, `sort` as for anime |
| GET | `/search/movies` | TMDB (key) | `year` |
| GET | `/search/games` | RAWG (key) | `platform` = `pc \| playstation \| xbox \| nintendo \| ios \| android \| mac \| linux`, `sort` = `relevance \| rating \| newest \| metacritic` |

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

The `metadata` field varies by provider. For example: `kind` (`album` / `track` / `anime` / `manga` / `movie` / `game`), `pageCount`, `publisher`, `episodes`, `score`, `platforms`, `metacritic`.

## Imports and jobs

| Method | Path | Description |
| --- | --- | --- |
| POST | `/imports/goodreads` | `multipart/form-data` with `file` (a Goodreads CSV export, max 2 MB). It's checked up front, then queued: returns `202 { jobId }`. If an import is already running, returns `409 { message, jobId }`. Not available on the demo account. |
| GET | `/jobs?name=import.goodreads&limit=10` | Your recent jobs, newest first (`limit` 1–20). |
| GET | `/jobs/:id` | `{ id, name, status, progress, result, error, createdAt, finishedAt }`. `status` is `queued`, `active`, `completed` or `failed`, and `progress` is 0–100. Other users' jobs return `404`. |

A finished Goodreads import's `result` is `{ imported, skipped, failures: [{ row, title, reason }], failuresTruncated }`. Failures are capped at 500.
