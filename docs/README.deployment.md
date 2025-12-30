# Deployment Overview

## Containerization
The backend image uses a multi‑stage Dockerfile (`server/dockerfile`):
- Builder: installs dependencies, generates Prisma client, and builds TypeScript.
- Dev: runs migrations, seeds, and starts the server with hot reload.
- Production: installs prod dependencies, copies built JS and Prisma assets, and runs with a non‑root user. A healthcheck targets `/healthz`.

The frontend image uses a nulti-stage Dockerfile (`client/dockerfile`):
- Builder: installs dependencies and builds TypeScript.
- Dev: starts the server with hot reload on Vite's dev server.
- Production: copies built JS files from builder and serves through nginx

Docker Compose files:
- `docker-compose.yml` (deployment): backend-Postgres compose for my local server 
- `docker-compose.prod.yml` (prod simulation): backend-frontend-Postgres for local production-like environment.
- `docker-compose.dev.yml` (dev simulation): mounts source for hot reload, exposes Prisma Studio, sets `VITE_API_URL=http://localhost:5000` for the frontend.
- `docker-compose.test-db.yml`: Postgres for running tests on host port 5433.

## Continuous Integration (CI)
The GitHub Actions workflow (`.github/workflows/ci.yml`) enforces quality gates on every push:
1. **Linting & Type-Checking**: Ensures code quality across both `client/` and `server/`.
2. **Security Audit**: Executes `npm audit --audit-level=high` to catch vulnerable dependencies early.
3. **Integration Testing**: Spins up a sidecar PostgreSQL container, runs migrations, and executes Jest/Supertest suites against a live database.