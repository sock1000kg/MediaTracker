# Quickstart

## Prerequisites
- Docker Engine, Docker Compose
- Node.js 22.17

## Environment config
Set up your environment variables in the .env.example files

## Dev (Docker Compose)
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

## Production (Docker Compose)
Build and run the production images (backend-frontend-database):
```bash
cd server
npm run prod:start
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