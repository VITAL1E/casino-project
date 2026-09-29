import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate as drizzleMigrate } from 'drizzle-orm/node-postgres/migrator'
import * as schema from './schema'

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://casino:casino@localhost:5432/casino',
})

export const db = drizzle(pool, { schema })

const HERE = path.dirname(fileURLToPath(import.meta.url))

// Applies any migrations in server/drizzle/ that aren't in drizzle's own
// __drizzle_migrations tracking table yet, in order. Run on every boot —
// a no-op once the DB is already current.
export const migrate = () => drizzleMigrate(db, { migrationsFolder: path.join(HERE, '..', 'drizzle') })

export { schema }
