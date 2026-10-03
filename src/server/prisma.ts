import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

declare global {
  // allow global prisma during development to prevent exhausting connections
  var prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set')
  }
  try {
    const url = new URL(connectionString)
    // Log connection details without password (user + host + database)
    const dbUser = url.username || '(no user)'
    // pathname can include query if ? was missing in URL (e.g. .../postgresschema=...)
    const rawPath = url.pathname?.replace(/^\//, '') || ''
    const dbName = rawPath.replace(/\?.*$/, '').split('?')[0] || '(default)'
    console.log('[DB] Connected as', dbUser, 'to', url.hostname + (url.port ? ':' + url.port : ''), 'database', dbName)
  } catch {
    console.log('[DB] Connected (connection string set)')
  }
  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({ adapter })
}
const prisma = global.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') global.prisma = prisma

export default prisma
