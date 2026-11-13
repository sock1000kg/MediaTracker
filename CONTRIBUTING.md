# Contributing

Thanks for your interest in MediaTracker. Bug reports, ideas and pull requests are all welcome.

## Reporting bugs and suggesting features

Open an issue with:
- what you did, what you expected, and what happened instead
- browser or OS and, for server issues, relevant logs (remove secrets, and passwords in URLs)
- screenshots for UI problems

## Development setup

Follow [docs/setup.md](docs/setup.md) to run the dev stack and the tests.

## Making changes

1. Fork the repo and create a branch from `main` (e.g. `fix/refresh-race` or `feat/letterboxd-import`).
2. Keep changes focused. One feature or fix per pull request is easiest to review.
3. Follow the existing structure:
   - **Server:** route → controller → service → repository. Validate input with Zod (`server/src/schemas`), and throw `AppError(message, status)` for expected errors. Never return `401` for anything other than an invalid or expired session; the client treats `401` as "log in again".
   - **Search providers:** pure URL builders and mappers, Zod-validated responses, and mocked `fetch` in tests (no real network calls).
   - **Client:** use the design tokens from `client/src/index.css` (`bg-card`, `text-muted-foreground`, …), not Tailwind palette colours or hex values. Follow [client/DESIGN.md](client/DESIGN.md).
4. Add or update tests:
   - **Server:** Jest unit tests in `server/src/tests/unit`, and Supertest integration tests in `server/src/tests/integration`.
   - **Client:** there's no test runner yet. Keep logic in pure helpers under `client/src/lib/` so it stays easy to test.
5. Before pushing, run:
   ```bash
   cd server && npm run lint && npx tsc --noEmit && npm test
   cd client && npm run lint && npm run build
   ```
6. Write clear commit messages. [Conventional Commits](https://www.conventionalcommits.org/) style (`feat:`, `fix:`, `docs:`, `chore:`) is preferred.
7. Open a pull request describing what changed and why, and how you tested it. For UI changes, include screenshots in both themes.

## Database changes

Edit `server/src/prisma/schema.prisma`, then create a migration (`npx prisma migrate dev --name <change>`) and commit it together with the schema. Migrations must be safe to run on start (`prisma migrate deploy`).

## Security

Please don't open a public issue for security problems. Contact the maintainer privately through GitHub instead.
