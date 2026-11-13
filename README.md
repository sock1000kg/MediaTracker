# Media Tracker (WIP)

A solo fullstack media logging webapp to help media lovers track everything in one place. Users won't have to switch between multiple apps to log what they've seen. It can be your own personal hub where you can log, rate and store notes of your favourite medias.

## Table of Contents
- [Setup Guide](./docs/README.setup.md)
- [Deployment Overview](./docs/README.deployment.md)

- [Tech Stack](#tech-stack)
- [Features](#features)
- [API Overview](#api-overview)
- [Demo Account](#demo-account)
- [Planned Features](#planned-features)

## Tech Stack
- **Backend**: Node.js, Express, Prisma, PostgreSQL
- **Frontend**: React, Vite, TailwindCSS, Shadcn/ui
- **Testing**: Jest, Supertest
- **Ops**: Docker, Docker Compose, GitHub Actions

## Features
### Authentication and Security
- **Hybrid Authentication**: Implements a high-security pattern using short-lived JWT Access Tokens (Header-based) and long-lived Refresh Tokens (**HttpOnly/SameSite Cookies**) to mitigate both XSS and CSRF risks.
- **Defense**: Uses **Helmet.js** for secure headers, **CORS** configuration, **Zod** schema validation, and **express-rate-limit** to prevent brute-force attacks.
- **Database Integrity**: Utilizes **Prisma ORM** with **PostgreSQL** for type-safe database queries and automated migrations.

### Media and Logs Management
- User-tied media types, medias, and logging
- Support adding custom media types and medias
- External APIs searching with Google Books and Last.fm

### Testing
- Unit tests for utility functions
- Integration tests for api routes

## API Overview
Other than Authentication and Health Checks, endpoints require an `Authorization Bearer <JWT>` header

### Authentication
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `POST /auth/refresh` - Refresh access token using HttpOnly cookie.
- `POST /auth/logout` - Revoke refresh token and clear cookies.

### Media Type Management  
- `GET /media-type` - Get user's media types
- `POST /media-type` - Create new media type
- `PUT /media-type/:name` - Update media type
- `DELETE /media-type/:name` - Delete media type

### Media Management  
- `GET /media` - Get user's medias
- `POST /media` - Create new media
- `PUT /media/:id` - Update media
- `DELETE /media/:id` - Delete media
- `PUT /media/media-log` - Atomic operation to create media and log in one step (use when searching)

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
- `GET /search/books?q=...&page=...` - Search books via Open Library API. Optional filters: `author`, `subject`, `language` (3-letter ISO 639-2 code, e.g. `eng`), `yearFrom`, `yearTo` (0-2100), `sort` (`relevance` | `new` | `old` | `rating`, default `relevance`). Invalid input returns 400 `{ message }`.
- `GET /search/music/albums?q=...&page=...` - Search music albums via Last.fm API.
- `GET /search/music/tracks?q=...&page=...` - Search music tracks via Last.fm API.

### Health
- `POST /healthz` - Liveness probe

## Background jobs
Long-running work runs on a generic, typed job queue (`server/src/queue/`) backed by [BullMQ](https://docs.bullmq.io/) and [Valkey](https://valkey.io/) (BSD-licensed, Redis-compatible). Currently the weekly demo-account reset is the only job (scheduled as `demo-reset-weekly`, Sundays 00:00, 3 attempts). `GET /jobs/:id` returns the status/progress/result of a job owned by the caller (404 otherwise).

| Variable | Purpose |
| --- | --- |
| `REDIS_URL` | Valkey/Redis connection (`redis://valkey:6379`, set for the backend by compose; `rediss://` and passwords in the URL work) |
| `QUEUE_DRIVER` | `bullmq` or `memory`. Empty = `bullmq` if `REDIS_URL` is set, else `memory`. `memory` is for tests/Valkey-less local dev only (no schedules) and is refused in production |
| `QUEUE_CONCURRENCY` | Jobs processed in parallel per worker (default 2) |
| `QUEUE_WORKER` | `true` (default) runs the worker inside the API process |

To run the worker separately later, run the same image twice: the API with `QUEUE_WORKER=false` and a second container with `QUEUE_WORKER=true`.

Tests: the BullMQ contract tests run only when `REDIS_URL_TEST` is set (`docker compose -f docker-compose.test-db.yml up` gives Valkey on `localhost:6380`).

## Demo Account

You can explore the app using the demo account at: https://media-tracker.sock1000kg.io.vn/
- **Username:** `demo`
- **Password:** `Demo123!!!`

## Planned Features
- More API providers
- User settings
- Filtering search and medias
- API intergration (Goodreads, AOTY,...)
- User statistics
- Multi-media recommendation service
