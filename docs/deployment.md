# Deployment

## Images

**Backend** (`server/dockerfile`), multi-stage:
- **builder:** installs dependencies, generates the Prisma client and compiles TypeScript.
- **dev:** runs migrations and the seed, then `tsx watch` (hot reload).
- **production:** production dependencies only, compiled JS and Prisma assets, a non-root user, and a healthcheck on `GET /healthz`. Migrations run on start (`prisma migrate deploy` is idempotent).

**Frontend** (`client/dockerfile`), multi-stage:
- **builder:** compiles TypeScript and builds with Vite. `VITE_API_URL` is a build argument, baked into the bundle.
- **dev:** the Vite dev server.
- **production:** the built static files served by nginx.

## Compose files

| File | Purpose |
| --- | --- |
| `docker-compose.yml` | The base stack: backend, PostgreSQL 17 and Valkey 8, with health-checked start order. The backend gets `REDIS_URL=redis://valkey:6379`. |
| `docker-compose.dev.yml` | The dev overlay: source mounts for hot reload, the frontend dev server on 5173, Prisma Studio on 5555, exposed ports (5000, 5432, 6379) and `ALLOWED_CORS` for the dev frontend. |
| `docker-compose.prod.yml` | The prod-like overlay: the nginx frontend on port 80 and exposed API and database ports, for running production images locally. |
| `docker-compose.test-db.yml` | Test infrastructure: PostgreSQL on 5433 and Valkey on 6380 (no persistence for Valkey). |

## Running in production

1. Build or pull the images. Set `VITE_API_URL` to your public API URL when building the frontend.
2. Provide `.env` with `NODE_ENV=production`, strong secrets, `ALLOWED_CORS` set to your frontend origin, and the database credentials. See [configuration.md](configuration.md).
3. `docker compose -f docker-compose.yml up -d` starts the backend, PostgreSQL and Valkey. Put the frontend (or any static host serving the built client) and the API behind your reverse proxy with HTTPS. Refresh cookies are `Secure` in production.
4. Back up the `postgres_data` volume. The `valkey_data` volume only holds queue state (jobs and schedules), and losing it just drops pending jobs.

**Scaling the worker:** by default the job worker runs inside the API process. To run it separately, start a second container from the backend image with `QUEUE_WORKER=true`, and set `QUEUE_WORKER=false` on the API containers.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request, and on pushes to `main` that touch `server/` or `client/`:
1. **Lint and type-check:** `client/` and `server/`.
2. **Security audit:** `npm audit --audit-level=high` for both images.
3. **Tests:** a PostgreSQL sidecar and a Valkey sidecar. It applies migrations, then runs Jest/Supertest. The BullMQ contract tests run against Valkey through `REDIS_URL_TEST`.

## Continuous delivery

- `.github/workflows/docker-publish.yml`: on `main` and on `v*.*.*` tags, builds and pushes images tagged with the branch, the commit SHA, the release version and `latest`.
- `.github/workflows/docker-publish-not-main.yaml`: on other branches, pushes images tagged with the branch and the SHA.
