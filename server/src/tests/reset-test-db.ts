import dotenv from 'dotenv'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import path from 'path'

// Load test environment
dotenv.config({ path: '.env.test' })

export default async function resetTestDb() {
  console.log('Using database:', process.env.DATABASE_URL)

  try {
    // Both commands will use the same environment
    execSync('npx prisma migrate reset --force --skip-seed', {
      stdio: 'inherit',
      env: { ...process.env }
    })
    
    execSync('tsx src/tests/seed.ts', {
      stdio: 'inherit',
      env: { ...process.env } 
    })
    
    console.log('Test database reset and seeded!')

  } catch(error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to reset test db"
    console.error('Error:', msg)
  }
}

const __filename = fileURLToPath(import.meta.url)

// Check if this file is the one being executed directly
// We use path.resolve to ensure slashes and drive letters match
if (process.argv[1] && path.resolve(__filename) === path.resolve(process.argv[1])) {
    resetTestDb().then(() => process.exit(0))
} else {
    // This will help see the mismatch if it fails
    console.log('Normalized Meta:', path.resolve(__filename));
    console.log('Normalized Argv:', path.resolve(process.argv[1]));
}