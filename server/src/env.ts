import dotenv from "dotenv"

// File paths are resolved relative to the server directory.
// process.cwd() is server/ for npm scripts, jest and the containers.
// When NODE_ENV === 'test', load .env.test first, then fall back to .env for shared secrets.
// Never use override: true so command line flags (DATABASE_URL, REDIS_URL_TEST) and container env always take precedence.
// Missing files (.env in production) are silently ignored by dotenv.
if (process.env.NODE_ENV === "test") {
  dotenv.config({ path: ".env.test" })
}
dotenv.config({ path: ".env" })
