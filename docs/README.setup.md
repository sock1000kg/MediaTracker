# Quickstart

## Prerequisites
- Docker Engine, Docker Compose
- Node.js 22.17 (if you plan to run scripts locally)

## Installation

## Environment files
Create these files at the repo root if you want to run on Docker, else create them in server directory:
1) `.env` (used by dev/prod Docker Compose)
```bash
NODE_ENV=development
RATE_LIMIT_ENABLED=true

# Postgres
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=media_tracker

# Server
PORT=5000
JWT_KEY_SECRET=replace_me_with_a_long_random_secret
API_KEY_SECRET=replace_me_with_a_long_random_secret
GOOGLE_BOOKS_API_KEY=your_google_book_api_key
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@database:5432/${POSTGRES_DB}

# Seeding
DEMO_USER_PASSWORD=Cool_pass_that_has_special_chars!_and_numbers123_and_upperCASE
SYSTEM_USER_PASSWORD=Cooler_pass_that_has_special_chars!_and_numbers123_upperCASE
```

2) `.env.test` (used by test database test runner)
```bash
NODE_ENV=test
RATE_LIMIT_ENABLED=false

POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=media_tracker_test

# The test DB is published on host port 5433 by docker-compose.test-db.yml
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5433/${POSTGRES_DB}

# Insert everything else in .env
```

3) `.env` (create this in client directory if you run dev without Docker)
```bash
VITE_API_URL=http://localhost:5000
```


## One‑command dev (Docker)
From the `server` directory:
```bash
npm run dev:start
```
This composes the base stack with the dev overlay to start:
- Backend in dev mode with TS hot reload (tsx, polling)
- Frontend in dev mode at http://localhost:5173
- Postgres database image
- Prisma Studio at http://localhost:5555

Stop dev stack:
```bash
docker compose down
```

## Run tests (Dockerized DB)
From the `server` directory:
```bash
npm run db-test:start # starts Postgres on host: 5433
npm run test # runs Jest with NODE_ENV=test
```
When done:
```bash
docker compose -f ../docker-compose.test-db.yml down -v
```

## Production (Docker)
Build and run the production images (backend-frontend-database):
```bash
cd server
npm run docker:start
```
or in project root
```bash
docker compose -f docker-compose.yml up --build
```
This composes:
- Frontend: http://localhost:80
- Backend API: http://localhost:5000 with Healthcheck: GET http://localhost:5000/healthz
- Postgres database image

Bring the stack down:
```bash
docker compose down
```