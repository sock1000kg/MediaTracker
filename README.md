# MediaTracker

[![CI](https://github.com/sock1000kg/MediaTracker/actions/workflows/ci.yml/badge.svg)](https://github.com/sock1000kg/MediaTracker/actions/workflows/ci.yml)

A self-hostable media journal: books, music, anime, manga, movies and games, all in one place. Search a catalogue, log it, rate it and keep notes, or add your own media.

**Live demo:** <https://media-tracker.sock1000kg.io.vn/> (username `demo`, password `Demo123!!!`; the demo account is reset weekly).

## Features

- **One log for everything:** status, a 0–100 rating and notes for any media type, including your own custom types.
- **Search built in:**
  - Books ([Open Library](https://openlibrary.org)), with author, subject, language, year and sort filters
  - Music ([Last.fm](https://www.last.fm/api)): albums and tracks, with tags saved as categories
  - Anime and manga ([Jikan](https://jikan.moe) / MyAnimeList)
  - Movies ([TMDB](https://www.themoviedb.org/documentation/api))
  - Games ([RAWG](https://rawg.io/apidocs))
- **Goodreads import:** upload your Goodreads CSV export; it runs as a background job with live progress.
- **Browse your way:**
  - list or cover-grid views
  - grouping by month or type, with Load more / Load all per group
  - filters by type, status, category, source and rating
  - multi-key sorting
- **Settings:** profile and password, preferences synced across devices, JSON/CSV export, account deletion.
- **A quiet, warm UI:** light and dark themes, plus a small blue mascot who has opinions. Design notes are in [`client/DESIGN.md`](client/DESIGN.md).
- **Security:** short-lived JWT access tokens plus rotating HttpOnly refresh cookies, Zod validation, Helmet, rate limiting, and encrypted per-user API keys.

## Tech stack

| Area | Tools |
| --- | --- |
| Frontend | React 19, Vite, TypeScript, Tailwind CSS v4, shadcn/ui (Radix), TanStack Query |
| Backend | Node.js 22, Express 5, TypeScript, Prisma, PostgreSQL 17, Zod |
| Background jobs | BullMQ on [Valkey](https://valkey.io) (BSD-licensed, Redis-compatible) |
| Testing | Jest, Supertest |
| Ops | Docker, Docker Compose, GitHub Actions |

## Quick start

You need **Docker** with Docker Compose, plus **Node.js 22** if you want to run scripts outside containers.

```bash
git clone https://github.com/sock1000kg/MediaTracker.git
cd MediaTracker
cp .env.example .env    # then fill in the values, see docs/configuration.md
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

| Service | URL |
| --- | --- |
| Frontend (Vite, hot reload) | <http://localhost:5173> |
| API | <http://localhost:5000> (health: `GET /healthz`) |
| Prisma Studio | <http://localhost:5555> |

On start, the backend runs the database migrations and seeds the system and demo users. Registering a new account needs the `REGISTER_KEY` from your `.env`.

Searching music, movies and games needs your own free API keys for Last.fm, TMDB and RAWG. Add them in the app under **Settings → API Keys**. Books and anime/manga need no key.

See **[docs/setup.md](docs/setup.md)** for running tests, production builds and running without Docker.

## Documentation

| Doc | Contents |
| --- | --- |
| [docs/setup.md](docs/setup.md) | Local development, tests, production build |
| [docs/configuration.md](docs/configuration.md) | Every environment variable |
| [docs/api.md](docs/api.md) | REST API reference |
| [docs/architecture.md](docs/architecture.md) | How the server, search providers, job queue and auth fit together |
| [docs/deployment.md](docs/deployment.md) | Docker images, Compose files, CI/CD |
| [client/DESIGN.md](client/DESIGN.md) | Visual design system and UI behaviour |

## Project structure

```
.
├── client/               React app (Vite)
│   ├── src/api/          API client (auth refresh, typed endpoints)
│   ├── src/components/   UI components (media-view, logs, media, search, ui)
│   ├── src/pages/        Pages and sections
│   └── DESIGN.md         Design system
├── server/               Express API
│   ├── src/api/          Routes and controllers
│   ├── src/services/     Business logic and search providers
│   ├── src/repositories/ Prisma data access
│   ├── src/queue/        Job queue (BullMQ/Valkey and in-memory drivers)
│   ├── src/prisma/       Schema and migrations
│   └── src/tests/        Unit and integration tests
├── docs/                 Documentation
└── docker-compose*.yml   Base, dev, prod-like and test stacks
```

## Roadmap

- User statistics (yearly totals, ratings over time)
- More importers (e.g. Letterboxd, MyAnimeList lists)
- Recommendations across media types

Suggestions are welcome: please open an issue.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Acknowledgements

Search data comes from Open Library, Last.fm, Jikan/MyAnimeList, RAWG and TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.

## License

No license has been chosen yet. Until one is added, all rights are reserved by the author.
