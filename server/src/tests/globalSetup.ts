import '../env.js'
import { execSync } from 'child_process'
import { assertSafeTestDatabase } from './testDbGuard.js'

export default async function globalSetup(): Promise<void> {
    assertSafeTestDatabase(process.env)
    execSync('npx prisma migrate deploy', {
        stdio: 'inherit',
        env: process.env,
    })
}
