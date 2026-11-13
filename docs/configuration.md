# Configuration

All configuration is done with environment variables. Templates:
- [`.env.example`](../.env.example): the app and Docker Compose
- [`.env.test.example`](../.env.test.example): the test suite

Never commit real `.env` files; they're git-ignored.

## Server

| Variable | Required | Description |
| --- | --- | --- |
| `NODE_ENV` | yes | `development`, `production` or `test`. Production enables secure cookies and refuses the in-memory job queue. |
| `PORT` | no | API port (default `5000`). |
| `DATABASE_URL` | yes | PostgreSQL connection string, e.g. `postgresql://user:pass@database:5432/mydb`. Use the host `database` inside Compose and `localhost` outside it. |
| `ALLOWED_CORS` | yes | Comma-separated list of browser origins allowed to call the API with credentials, e.g. `https://tracker.example.com`. The dev Compose file sets `http://localhost:5173`. |
| `RATE_LIMIT_ENABLED` | no | `true` enables the global, login, sign-up and sensitive-action rate limiters. |
| `REGISTER_KEY` | yes | A shared secret required to register an account (keeps public instances invite-only). |
| `JWT_KEY_SECRET` | yes | Signs the 15-minute access tokens. |
| `JWT_REFRESH_SECRET` | yes | Signs the 7-day refresh tokens. |
| `API_KEY_SECRET` | yes | Encrypts the users' stored third-party API keys. **Changing it makes the stored keys unreadable.** |
| `CONTACT_EMAIL` | recommended | Sent in the `User-Agent` to Open Library and other providers, as they ask. |
| `VERSION` | no | App version, sent in the `User-Agent`. |

## Job queue

| Variable | Required | Description |
| --- | --- | --- |
| `REDIS_URL` | in production | Valkey/Redis connection for BullMQ. Compose already sets `redis://valkey:6379` for the backend container, so set it yourself only when running the server outside Compose. `rediss://` and credentials in the URL work. |
| `QUEUE_DRIVER` | no | `bullmq` or `memory`. If empty: `bullmq` when `REDIS_URL` is set, otherwise `memory`. `memory` is for tests and Valkey-less local dev only (it has no schedules, and jobs are lost on restart). It's refused when `NODE_ENV=production`. |
| `QUEUE_CONCURRENCY` | no | Jobs processed in parallel by one worker (default `2`). |
| `QUEUE_WORKER` | no | `true` (default) runs the job worker inside the API process. To run a separate worker, start the same image twice: the API with `false`, the worker with `true`. |

## Seeding (demo and system users)

| Variable | Required | Description |
| --- | --- | --- |
| `SYSTEM_USER_PASSWORD` | yes | Password for the internal `system` user that owns shared media and the built-in media types. |
| `DEMO_USER_PASSWORD` | yes | Password for the `demo` user. |
| `LASTFM_API_KEY` | no | Gives the demo user a Last.fm key (music search). |
| `TMDB_API_KEY` | no | Gives the demo user a TMDB key or v4 read access token (movie search). |
| `RAWG_API_KEY` | no | Gives the demo user a RAWG key (game search). |

## Database container

| Variable | Description |
| --- | --- |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Used by the `postgres:17` service. They must match `DATABASE_URL`. |

## Frontend (build time)

| Variable | Description |
| --- | --- |
| `VITE_API_URL` | The API's base URL, built into the client bundle. The dev and prod Compose files set it to `http://localhost:5000`. Set your public API URL when building for deployment. |

## Tests only

| Variable | Description |
| --- | --- |
| `DATABASE_URL` (in `server/.env.test`) | Must contain `_test` in the database name. The test setup **resets** this database. |
| `REDIS_URL_TEST` | When set (e.g. `redis://localhost:6380`), the BullMQ queue contract tests run against it. Otherwise they're skipped. |
