# Media Tracker (WIP)

A solo fullstack media logging webapp to help media lovers track everything in one place. Users won't have to switch between multiple apps to log what they've seen. This app supports music, books, movies,... It can be your very own personal hub where you can log, rate and store notes of your favourite medias. You can also add you own medias if the app doesn't have them!

## Tech Stack
- Backend: Node.js, Express, Prisma, PostgreSQL
- Frontend: React, Vite, CSS
- Testing: Jest, Supertest
- Auth: JWT, bcrypt, express-rate-limit

## Features
### Authentication and Security
- User authentication with JWT token
- Password storage with bcryptjs
- Input sanitization and validation (Prevents XSS and injections)
- Rate limiting per user or IP to prevent abuse

### Media and Logs Management
- User-tied media types, medias, and logging
- Support adding custom media types and medias

### Testing
- Unit tests for all utility functions
- Integration tests for all api routes

## Installation

## API Overview
### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login

### Media Type Management  
- `GET /api/media-type` - Get user's media types
- `POST /api/media-type` - Create new media type
- `PUT /api/media-type/:name` - Update media type
- `DELETE /api/media-type/:name` - Delete media type

### Media Management  
- `GET /api/media` - Get user's medias
- `POST /api/media` - Create new media
- `PUT /api/media/:id` - Update media
- `DELETE /api/media/:id` - Delete media

### Logs Management  
- `GET /api/logs` - Get user's logs
- `POST /api/logs` - Create new log
- `PUT /api/logs/:id` - Update log
- `DELETE /api/logs/:id` - Delete log

### Notes / Sanitization Rules
#### Auth
- Username: Max 30 chars, min 3 chars, no whitespaces
- Display name: Max 50 chars, no empty names
- Password: At least 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char

#### Logs
- Rating: Must be 0–100. Invalid → ignored.
- Status: Only "Completed", "In progress", "Wishlist", "None" are valid. Invalid → ignored.
- Notes: Trimmed and max length 5000 characters.

#### Media
- Title and creator: Trimmed and max length 100 chars
- Year: Must be an Interger
- Metadata: Must be JSON object
- Media: User can only log media they created or global media.

#### Media Types
- Name: Trimed and lowercased

## Planned Features

