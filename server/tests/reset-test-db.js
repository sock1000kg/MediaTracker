import dotenv from 'dotenv'
import { execSync } from 'child_process'

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
    
    execSync('node prisma/seed.js', {
      stdio: 'inherit',
      env: { ...process.env } 
    })
    
    console.log('Test database reset and seeded!')

  }catch(error) {
    console.error('Error:', error.message)
  }
}

resetTestDb()