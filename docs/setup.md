# Setup

## Prerequisites

- Docker Engine with Docker Compose v2
- Node.js 22 (the images use `node:22.17-alpine`) and npm, for running scripts and tests on the host

## 1. Configure

```bash
cp server/.env.example server/.env          # Docker Compose and the backend
cp server/.env.test.example server/.env.test # Jest and test database
```

Fill in the values. Every variable is described in [configuration.md](configuration.md). At minimum you need:
- the Postgres credentials and `DATABASE_URL`
- the three secrets (`JWT_KEY_SECRET`, `JWT_REFRESH_SECRET`, `API_KEY_SECRET`)
- `REGISTER_KEY`
- `DEMO_USER_PASSWORD` and `SYSTEM_USER_PASSWORD`
- `ALLOWED_CORS` (the dev Compose file already sets it for the Vite dev server)

## 2. Run the development stack

From the repository root:

```bash
docker compose --env-file server/.env -f docker-compose.yml -f docker-compose.dev.yml up --build
```

(or `npm run dev:start` from `server/`)

| Service | Address | Notes |
| --- | --- | --- |
| frontend | <http://localhost:5173> | Vite dev server; `./client` is mounted, so edits reload live |
| backend | <http://localhost:5000> | `tsx watch`; `./server/src` is mounted |
| database | `localhost:5432` | PostgreSQL 17 |
| valkey | `localhost:6379` | Job queue (BullMQ) |
| prisma-studio | <http://localhost:5555> | Database browser |

On start, the backend runs `prisma migrate deploy` and then the seed, which creates:
- the `system` user and the built-in media types
- the `demo` user, with sample logs from `server/src/tests/goodreads_seed.csv` and the committed demo media fixture

Stop it with:

```bash
docker compose --env-file server/.env -f docker-compose.yml -f docker-compose.dev.yml down
```

### Port 5173 already in use?

Add a small override file that maps the frontend to another port and allows that origin:

```yaml
# compose.local.yml (keep it out of git)
services:
  backend:
    environment:
      - ALLOWED_CORS=http://localhost:5174
  frontend:
    ports: !override
      - "5174:5173"
```

```bash
docker compose --env-file server/.env -f docker-compose.yml -f docker-compose.dev.yml -f compose.local.yml up --build
```

## 3. API keys for search

| Search | Service | Get a key |
| --- | --- | --- |
| Music | Last.fm | <https://www.last.fm/api/account/create> |
| Movies | TMDB (API key or v4 read access token) | <https://www.themoviedb.org/settings/api> |
| Games | RAWG | <https://rawg.io/apidocs> |
| Board games | BoardGameGeek (token) | <https://boardgamegeek.com/applications> |

Setting `LASTFM_API_KEY`, `TMDB_API_KEY` or `RAWG_API_KEY` in `server/.env` gives the demo user a key when the seed runs. BoardGameGeek is a per-user key added in the app under **Settings → API Keys**.

### Demo media fixture

The demo account seeds from a committed offline fixture (`server/src/tests/fixtures/demo/demo-media.json`), so seeding never makes provider calls. To re-fetch and rebuild the fixture:

```bash
cd server
npm run build-demo-fixture
```

This requires `LASTFM_API_KEY`, `TMDB_API_KEY` (a TMDB API Read Access Token) and `RAWG_API_KEY` in `server/.env`.

## 4. Run the tests

The test suite needs its own PostgreSQL. The BullMQ tests optionally also need Valkey.

```bash
cd server
npm run db-test:start   # Postgres on localhost:5433, Valkey on localhost:6380
npm test                # builds, then runs Jest (unit + integration) with coverage
```

- The test suite never drops databases: it deploys migrations once (`prisma migrate deploy` in `globalSetup`), then resets data between files using fast SQL `TRUNCATE ... RESTART IDENTITY CASCADE` and in-process seeding.
- A test database guard (`assertSafeTestDatabase`) strictly verifies that `NODE_ENV=test`, `DATABASE_URL` is set, the database name ends with `_test`, and the host is local (`localhost`, `127.0.0.1`, `::1`, `postgres`, `database_test`). Running against a remote host requires explicitly setting `ALLOW_REMOTE_TEST_DB=1`.
- The BullMQ queue contract tests run only when `REDIS_URL_TEST` is set (e.g. `REDIS_URL_TEST=redis://localhost:6380`). Without it they're skipped, and the in-memory driver is tested instead.

### Client tests

The client uses [Vitest](https://vitest.dev) for its pure helpers and the API wrapper. It needs no database or browser:

```bash
cd client
npm test    # vitest run; tests are src/**/*.test.ts, with the "@/" alias
```

Shut the test stack down with:

```bash
docker compose --env-file server/.env.test -f docker-compose.test-db.yml down -v
```

Other checks (CI runs these too):

```bash
cd server && npm run lint && npx tsc --noEmit
cd client && npm run lint && npm run build
```

## 5. Production-like build

```bash
docker compose --env-file server/.env -f docker-compose.yml -f docker-compose.prod.yml up --build
```

(or `npm run prod:start` from `server/`)

This builds the production images: the frontend is served by nginx on <http://localhost:80>, the API runs on <http://localhost:5000>, and PostgreSQL and Valkey run alongside. See [deployment.md](deployment.md) for details.

## Running without Docker

You can run the backend and frontend on the host:

```bash
cd server && npm ci && npx prisma generate && npx prisma migrate deploy && npm run seed && npm run dev
cd client && npm ci && VITE_API_URL=http://localhost:5000 npm run dev
```

You still need a PostgreSQL to connect to.
- Without `REDIS_URL`, the server uses the in-memory job queue in development. Background jobs still run, but scheduled jobs (the weekly demo reset) are disabled, and queued jobs are lost on restart.
- Production refuses to start without `REDIS_URL`.
