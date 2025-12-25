# Media Tracker (WIP)

A solo fullstack media logging webapp to help media lovers track everything in one place. Users won't have to switch between multiple apps to log what they've seen. This app supports music, books, movies,... It can be your own personal hub where you can log, rate and store notes of your favourite medias. You can also add you own custom medias if the app doesn't have them!

## Table of Contents
- [Setup Guide](./docs/README.setup.md)
- [Deployment Overview](./docs/README.deployment.md)

- [Tech Stack](#tech-stack)
- [Features](#features)
- [API Overview](#api-overview)
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
Unless noted, endpoints require an `Authorization Bearer <JWT>` header

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
- `GET /search/books?q=...&startIndex=...` - Search book via Google Books API
- `GET /search/music/albums?q=...` - Search music albums via Last.fm API.
- `GET /search/music/tracks?q=...` - Search music tracks via Last.fm API.

### Health
- `POST /healthz` - Liveness probe

## Planned Features
- More API providers
- User settings
- Filtering search and logs
- API intergration (Goodreads, AOTY,...)
- User statistics
- Multi-media recommendation service