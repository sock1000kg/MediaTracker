# Deployment Overview

The backend image uses a multi‑stage Dockerfile (`server/dockerfile`):
- Builder: installs dependencies, generates Prisma client, and builds TypeScript.
- Dev: runs migrations, seeds, and starts the server with hot reload.
- Production: installs prod deps, copies built JS and Prisma assets, and runs with a non‑root user. A healthcheck targets `/healthz`.

Docker Compose files:
- `docker-compose.yml` (prod): backend  frontend  Postgres, sensible defaults for local production.
- `docker-compose.dev.yml` (overlay): mounts source for hot reload, exposes Prisma Studio, sets `VITE_API_URL=http://localhost:5000` for the frontend.
- `docker-compose.test-db.yml`: lightweight Postgres for running tests on port 5433.

If you later add alternative deployment targets (e.g., Fly.io, Render, Railway, K8s), keep this section high‑level here and link out to platform‑specific guides (e.g., `docs/deployment-<provider>.md`). For now, a single section in the root README keeps things simple.