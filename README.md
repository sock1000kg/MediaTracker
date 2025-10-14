# Media Tracker

Your personal full‑stack hub to log and rate everything you watch, read, and listen to. Track books, movies, music, and custom media types—all in one place.

## Table of Contents
- [Tech Stack](#tech-stack)
- [Monorepo Layout](#monorepo-layout)
- [Features](#features)
- [Quickstart](#quickstart)
  - [Prerequisites](#prerequisites)
  - [Environment files](#environment-files)
  - [One‑command dev (Docker)](#onecommand-dev-docker)
  - [Run tests (Dockerized DB)](#run-tests-dockerized-db)
  - [Production (Docker)](#production-docker)
- [Scripts](#scripts)
- [API Overview](#api-overview)
- [Deployment](#deployment)
- [Planned Features](#planned-features)

## Tech Stack
- Backend: Node.js, Express, Prisma, PostgreSQL
- Frontend: React, Vite, TailwindCSS, shadcn/ui
- Testing: Jest, Supertest
- Auth and Sanitization: JWT, bcrypt, express-rate-limit, Zod

## Monorepo Layout
- `client`: React + Vite frontend
- `server`: Node/Express backend (Prisma + PostgreSQL)
- `docker-compose.yml`: Production stack (backend, frontend, database)
- `docker-compose.dev.yml`: Dev overlay (hot reload, volumes, Prisma Studio)
- `docker-compose.test-db.yml`: Ephemeral Postgres instance for running tests

## Features
### Authentication and Security
- User authentication with JWT token
- Password storage with bcryptjs
- Input sanitization and validation with Zod
- Rate limiting per user or with a fallback to IP to prevent abuse

### Media and Logs Management
- User-tied media types, media, and logging
- Support adding custom media types and media

### Testing
- Unit tests for all utility functions
- Integration tests for all api routes

## Quickstart

### Prerequisites
- Docker Engine + Docker Compose v2
- Node.js 18+ (only if you plan to run scripts locally)

### Environment files
Create these files at the repo root:

1) `.env` (used by dev/prod Docker Compose)
```bash
# Postgres
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=media_tracker

# Server
PORT=5000
JWT_KEY_SECRET=replace_me_with_a_long_random_secret
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@database:5432/${POSTGRES_DB}?schema=public
```

2) `.env.test` (used by test database + test runner)
```bash
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=media_tracker_test

# The test DB is published on host port 5433 by docker-compose.test-db.yml
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5433/${POSTGRES_DB}?schema=public
NODE_ENV=test
```

### One‑command dev (Docker)
From the `server` directory:
```bash
cd server
npm run dev:start
```
This composes the base stack with the dev overlay to start:
- Backend in dev mode with TS hot reload (tsx, polling)
- Frontend in dev mode at http://localhost:5173
- Postgres
- Optional Prisma Studio at http://localhost:5555

Stop dev stack:
```bash
docker compose -f ../docker-compose.yml -f ../docker-compose.dev.yml down
```

### Run tests (Dockerized DB)
From the `server` directory:
```bash
npm run db-test:start   # starts ephemeral Postgres on host :5433
npm test                # runs Jest with NODE_ENV=test
```
When done:
```bash
docker compose -f ../docker-compose.test-db.yml down -v
```

### Production (Docker)
Build and run the production images (backend + frontend + database):
```bash
cd server
npm run docker:start    # alias for: docker compose -f ../docker-compose.yml up -d
```
Services:
- Frontend: http://localhost:80
- Backend API: http://localhost:5000
- Healthcheck: GET http://localhost:5000/healthz

Bring the stack down:
```bash
docker compose -f ../docker-compose.yml down -v
```

### Notes for contributors
- If you run the frontend outside Docker, set `VITE_API_URL` to your backend URL (e.g., `http://localhost:5000`).
- On some systems, you may need to adjust the backend dev volume mapping. In `docker-compose.dev.yml`, replace any absolute path with a relative one like `./server/src:/app/src`.

## Scripts

### Server (`server/package.json`)
- `dev`: Run backend with TS hot reload (tsx)
- `build`: TypeScript build + path alias rewrite
- `start`: Start compiled server
- `test`: Run Jest in band with `NODE_ENV=test`
- `seed`: Seed database (uses built files)
- `reset`: Reset DB then seed
- `reset-test-db`: Reset test DB data
- `dev:start`: Compose dev stack (backend+frontend+db)
- `db-test:start`: Start test Postgres (port 5433 on host)
- `docker:start`: Compose production stack

### Client (`client/package.json`)
- `dev`: Start Vite dev server
- `build`: Type-check then build
- `preview`: Preview built app

## API Overview
Unless noted, endpoints require an `Authorization: Bearer <JWT>` header.

### Authentication
- `POST /auth/register` - User registration
- `POST /auth/login` - User login

### Media Type Management  
- `GET /media-type` - Get user's media types
- `POST /media-type` - Create new media type
- `PUT /media-type/:name` - Update media type
- `DELETE /media-type/:name` - Delete media type

### Media Management  
- `GET /media` - Get user's media
- `POST /media` - Create new media
- `PUT /media/:id` - Update media
- `DELETE /media/:id` - Delete media

### Logs Management  
- `GET /logs` - Get user's logs
- `POST /logs` - Create new log
- `PUT /logs/:id` - Update log
- `DELETE /logs/:id` - Delete log

### API Keys
- `GET /api-key` - Get user's API keys
- `POST /api-key` - Add new API key
- `PUT /api-key` - Update an API key
- `DELETE /api-key` - Delete an API key

### Search
- `PUT /search/media-log` - Create a media and an associated log in one step
- `GET /search/books?q=...&startIndex=...` - Search books via provider

### Health
- `GET /healthz` - Liveness/readiness probe

### Notes / Sanitization Rules
#### Auth
- Username: Max 30 chars, min 3 chars, no whitespaces
- Display name: Max 50 chars, min 3 chars
- Password: At least 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char

#### Logs
- Rating: Must be 0–100. Invalid → ignored.
- Status: Only "completed", "in progress", "wishlist", "none" are valid. Invalid → ignored.
- Notes: Trimmed and max length 5000 characters.

 #### Media
- Title and creator: Trimmed and max length 100 chars
 - Year: Must be an Integer
- Metadata: Must be JSON object
- Media: User can only log media they created or global media.

#### Media Types
- Name: Trimmed and lowercased

## Deployment

The backend image uses a multi‑stage Dockerfile (`server/dockerfile`):
- Builder: installs dependencies, generates Prisma client, and builds TypeScript.
- Dev: runs migrations, seeds, and starts the server with hot reload.
- Production: installs prod deps, copies built JS and Prisma assets, and runs with a non‑root user. A healthcheck targets `/healthz`.

Docker Compose files:
- `docker-compose.yml` (prod): backend + frontend + Postgres, sensible defaults for local production.
- `docker-compose.dev.yml` (overlay): mounts source for hot reload, exposes Prisma Studio, sets `VITE_API_URL=http://localhost:5000` for the frontend.
- `docker-compose.test-db.yml`: lightweight Postgres for running tests on port 5433.

If you later add alternative deployment targets (e.g., Fly.io, Render, Railway, K8s), keep this section high‑level here and link out to platform‑specific guides (e.g., `docs/deployment-<provider>.md`). For now, a single section in the root README keeps things simple.

## Planned Features

