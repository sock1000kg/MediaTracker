import dotenv from "dotenv"
import { defineConfig } from "prisma/config"

// File paths are resolved relative to the server directory.
// When NODE_ENV === 'test', load .env.test first, then fall back to .env.
// No override, so process.env (CLI flags, etc.) always takes precedence.
if (process.env.NODE_ENV === "test") {
  dotenv.config({ path: ".env.test" })
}
dotenv.config({ path: ".env" })

const needsDb = process.argv.some(arg => ["migrate", "db", "studio"].includes(arg))
if (!process.env.DATABASE_URL && needsDb) {
  throw new Error("DATABASE_URL is not set (needed for prisma migrate/db/studio)")
}

export default defineConfig({
  schema: "src/prisma/schema.prisma",
  migrations: {
    path: "src/prisma/migrations",
    seed: "tsx src/tests/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL || "postgresql://unset@invalid:5432/unset",
    // Only needed for `prisma migrate diff --from-migrations` (drift checks)
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
})
