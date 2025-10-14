# Deployment Overview

## Containerization
The backend image uses a multi‑stage Dockerfile (`server/dockerfile`):
- Builder: installs dependencies, generates Prisma client, and builds TypeScript.
- Dev: runs migrations, seeds, and starts the server with hot reload.
- Production: installs prod deps, copies built JS and Prisma assets, and runs with a non‑root user. A healthcheck targets `/healthz`.

The frontend image uses a nulti-stage Dockerfile (`client/dockerfile`):
- Builder: installs dependencies and builds TypeScript.
- Dev: starts the server with hot reload on Vite's dev server.
- Production: copies built JS files from builder and serves through nginx

Docker Compose files:
- `docker-compose.yml` (prod): backend-frontend-Postgres for local production-like environment.
- `docker-compose.dev.yml` (overlay): mounts source for hot reload, exposes Prisma Studio, sets `VITE_API_URL=http://localhost:5000` for the frontend.
- `docker-compose.test-db.yml`: Postgres for running tests on port 5433.