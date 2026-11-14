import '@/env.js'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import path from 'path'
import { redactUrl } from '../redactUrl.js'
import { assertSafeTestDatabase } from './testDbGuard.js'
import { resetTestData } from './testDb.js'

export default async function resetTestDb() {
  assertSafeTestDatabase(process.env)
  console.log('Using database:', redactUrl(process.env.DATABASE_URL))

  try {
    execSync('npx prisma migrate deploy', {
      stdio: 'inherit',
      env: { ...process.env }
    })

    await resetTestData()
    console.log('Test database reset and seeded!')
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to reset test db"
    console.error('Error:', msg)
    throw error
  }
}

const __filename = fileURLToPath(import.meta.url)

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  resetTestDb()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Failed to reset test db:', err)
      process.exit(1)
    })
} else {
  console.log('Normalized Meta:', path.resolve(__filename))
  console.log('Normalized Argv:', path.resolve(process.argv[1]))
}
