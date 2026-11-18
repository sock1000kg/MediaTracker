# MediaTracker

[![CI](https://github.com/sock1000kg/MediaTracker/actions/workflows/ci.yml/badge.svg)](https://github.com/sock1000kg/MediaTracker/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A self-hostable media journal: books, music, anime, manga, movies, TV, video games and board games, all in one place. Search a catalogue, log it, rate it and keep notes, or add your own media. Designed to be simple, and feels more like a journal rather than a media bank. Created for my personal use.

**Live demo:** <https://media-tracker.sock1000kg.io.vn/> (username `demo`, password `Demo123!!!`; the demo account is reset weekly)

## Features

- **One log for everything:** status, a 0–100 rating and notes for any media type, including your own custom types.
- **Search built in:**
  - Books ([Open Library](https://openlibrary.org)), with author, subject, language, year and sort filters
  - Music ([Last.fm](https://www.last.fm/api)): albums and tracks, with tags saved as categories
  - Anime and manga ([AniList](https://anilist.co))
  - Movies ([TMDB](https://www.themoviedb.org/documentation/api))
  - Games ([RAWG](https://rawg.io/apidocs)): video games and board games ([BoardGameGeek](https://boardgamegeek.com))
- **Stats:** activity over time, ratings, top categories, top tags and creators, and type-specific stats.
- **Personal tags:** private tags per user with autocomplete, set semantics on logs, and management in Settings.
- **Collections:** private collections (ordered lists) with optional ranking.
- **Imports**:
  - **Goodreads import:** upload your Goodreads CSV export
  - **MyAnimeList import:** upload your MAL anime or manga export (`.xml` or `.xml.gz`)
  - **Letterboxd import:** upload your Letterboxd ZIP export (ratings, diary, watchlist, likes, and lists as collections)
- **Browsing:**
  - list or cover-grid views
  - grouping by month or type, with Load more / Load all per group
  - filters by type, status, category, tag, source and rating
  - multi-key sorting
- **Settings:** profile and password, preferences synced across devices, JSON/CSV export, account deletion.
- **Security:** short-lived JWT access tokens plus rotating HttpOnly refresh cookies, Zod validation, Helmet, rate limiting, and encrypted per-user API keys.

## Tech stack

| Area            | Tools                                                                          |
| --------------- | ------------------------------------------------------------------------------ |
| Frontend        | React 19, Vite, TypeScript, Tailwind CSS v4, shadcn/ui (Radix), TanStack Query |
| Backend         | Node.js 22, Express 5, TypeScript, Prisma, PostgreSQL 17, Zod                  |
| Background jobs | BullMQ on [Valkey](https://valkey.io) (BSD-licensed, Redis-compatible)         |
| Testing         | Jest, Vitest, Supertest                                                        |
| Ops             | Docker, Docker Compose, GitHub Actions                                         |

## Quick start

You need **Docker** with Docker Compose, plus **Node.js 22** if you want to run scripts outside containers.

```bash
git clone https://github.com/sock1000kg/MediaTracker.git
cd MediaTracker
cp server/.env.example server/.env    # then fill in the values, see docs/configuration.md
docker compose --env-file server/.env -f docker-compose.yml -f docker-compose.dev.yml up --build
```

| Service                     | URL                                              |
| --------------------------- | ------------------------------------------------ |
| Frontend (Vite, hot reload) | <http://localhost:5173>                          |
| API                         | <http://localhost:5000> (health: `GET /healthz`) |
| Prisma Studio               | <http://localhost:5555>                          |

On start, the backend runs the database migrations and seeds the system and demo users. Registering a new account needs the `REGISTER_KEY` from your `.env`.

Searching music, movies, video games, and board games needs your own free API keys or tokens: Last.fm, TMDB, RAWG, and BoardGameGeek (application token from [boardgamegeek.com/applications](https://boardgamegeek.com/applications)). These are per-user keys configured in the app under **Settings → API Keys**. Books and anime/manga need no key.

See **[docs/setup.md](docs/setup.md)** for running tests, production builds and running without Docker.

## Documentation

| Doc                                            | Contents                                                               |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| [AGENTS.md](AGENTS.md)                         | Guide for coding agents                                                |
| [docs/decisions.md](docs/decisions.md)         | Architectural decisions, constraints, and provider quirks              |
| [docs/setup.md](docs/setup.md)                 | Local development, tests, production build                             |
| [docs/configuration.md](docs/configuration.md) | Every environment variable                                             |
| [docs/api.md](docs/api.md)                     | REST API reference                                                     |
| [docs/architecture.md](docs/architecture.md)   | How the server, search providers, job queue and auth fit together      |
| [docs/providers.md](docs/providers.md)         | Data providers: their terms, what we must not do, required attribution |
| [docs/deployment.md](docs/deployment.md)       | Docker images, Compose files, CI/CD                                    |
| [client/DESIGN.md](client/DESIGN.md)           | Visual design system and UI behaviour                                  |

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

- Cross-media recommendations (somehow)
- More importers (e.g. MyAnimeList lists)
- Recommendations across media types

## Acknowledgements

Search data comes from Open Library, Last.fm, AniList, RAWG, TMDB, BoardGameGeek, and MusicBrainz / Cover Art Archive. This product uses the TMDB API but is not endorsed or certified by TMDB.

## License

[MIT](LICENSE) © sock1000kg
