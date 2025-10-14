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
- Backend: Node.js, Express, Prisma, PostgreSQL
- Frontend: React, Vite, TailwindCSS, Shadcn/ui
- Testing: Jest, Supertest
- Auth and Sanitization: Zod, JWT, bcrypt, express-rate-limit

## Features
### Authentication and Security
- User authentication with JWT token
- Password storage with bcryptjs
- Input sanitization and validation with Zod
- Rate limiting per user or with a fallback to IP to prevent abuse

### Media and Logs Management
- User-tied media types, medias, and logging
- Support adding custom media types and medias

### Testing
- Unit tests for all utility functions
- Integration tests for all api routes

## API Overview
Unless noted, endpoints require an `AuthorizationL Bearer <JWT>` header

### Authentication
- `POST /auth/register` - User registration
- `POST /auth/login` - User login

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
- `PUT /search/media-log` - Create a media and an associated log in one step (use when searching)
- `GET /search/book?q=...&startIndex=...` - Search book via Google Books API

### Health
- `GET /healthz` - Liveness probe

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

## Planned Features