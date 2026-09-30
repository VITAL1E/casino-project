// User provisioning shared by every sign-in method (password, OAuth,
// wallet). Each method ends up calling one of the functions below instead
// of touching `users`/`wallets`/`ledger` directly, so "new user gets a
// wallet + signup bonus" stays true in exactly one place.
import bcrypt from 'bcryptjs'
import { eq, and } from 'drizzle-orm'
import { db, schema } from '../db'
import { PublicError, isPwnedPassword } from '../security'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

export type PublicUser = { id: string; username: string }

const START_BALANCE = 1000

// Accepts either `db` or a transaction handle — both implement the same
// select/insert query builder, only the outer scope's begin/commit differs.
type Queryable = NodePgDatabase<typeof schema>

const provisionWallet = async (tx: Queryable, userId: string) => {
  await tx.insert(schema.wallets).values({ userId, balance: String(START_BALANCE) })
  await tx.insert(schema.ledger).values({
    userId, amount: String(START_BALANCE), reason: 'signup_bonus', balanceAfter: String(START_BALANCE),
  })
}

// Appends a short random suffix until it finds a free username — used when
// a provider hands us a display name that might already be taken.
const uniqueUsername = async (base: string): Promise<string> => {
  const cleaned = base.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24) || 'player'
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = attempt === 0 ? cleaned : `${cleaned}${Math.floor(Math.random() * 10000)}`
    const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.username, candidate))
    if (!existing) return candidate
  }
  throw new Error('could not allocate a username')
}

export const createLocalUser = async (username: string, password: string, email: string | null): Promise<PublicUser> => {
  if (typeof username !== 'string' || typeof password !== 'string') throw new PublicError('invalid input')
  if (email !== null && typeof email !== 'string') throw new PublicError('invalid input')
  username = username.trim()
  if (username.length < 3 || username.length > 32) throw new PublicError('username must be 3-32 characters')
  if (password.length < 8 || password.length > 72) throw new PublicError('password must be 8-72 characters')
  if (await isPwnedPassword(password)) throw new PublicError('this password appeared in a data breach, choose another')

  const hash = await bcrypt.hash(password, 12)
  try {
    return await db.transaction(async tx => {
      const [row] = await tx.insert(schema.users)
        .values({ username, email: email || null, passwordHash: hash })
        .returning({ id: schema.users.id })
      await provisionWallet(tx, row.id)
      return { id: row.id, username }
    })
  } catch (e) {
    if ((e as { code?: string }).code === '23505') throw new PublicError('username or email already taken')
    throw e
  }
}

export const verifyLocalLogin = async (username: unknown, password: unknown): Promise<PublicUser> => {
  if (typeof username !== 'string' || typeof password !== 'string' || password.length > 72) throw new PublicError('invalid username or password', 401)
  const [row] = await db.select({ id: schema.users.id, username: schema.users.username, passwordHash: schema.users.passwordHash })
    .from(schema.users).where(eq(schema.users.username, username.trim()))

  // Compare against a dummy hash when the user doesn't exist, or exists but
  // has no password (an OAuth/wallet-only account), so the response time
  // and error never leak which case it was.
  const hash = row?.passwordHash ?? '$2a$12$invalidsaltinvalidsaltinvOe'
  const ok = await bcrypt.compare(password, hash)
  if (!row || !row.passwordHash || !ok) throw new PublicError('invalid username or password', 401)
  return { id: row.id, username: row.username }
}

// Looks up a user already linked to this OAuth identity, otherwise creates
// one (and links it) inside a single transaction.
export const findOrCreateOAuthUser = async (
  provider: string,
  providerUserId: string,
  profile: { email: string | null; suggestedUsername: string },
): Promise<PublicUser> => {
  const [existing] = await db.select({ id: schema.users.id, username: schema.users.username })
    .from(schema.oauthAccounts)
    .innerJoin(schema.users, eq(schema.users.id, schema.oauthAccounts.userId))
    .where(and(eq(schema.oauthAccounts.provider, provider), eq(schema.oauthAccounts.providerUserId, providerUserId)))
  if (existing) return existing

  const username = await uniqueUsername(profile.suggestedUsername)
  return db.transaction(async tx => {
    const [row] = await tx.insert(schema.users)
      .values({ username, email: profile.email })
      .returning({ id: schema.users.id })
    await tx.insert(schema.oauthAccounts).values({ userId: row.id, provider, providerUserId })
    await provisionWallet(tx, row.id)
    return { id: row.id, username }
  })
}

// Same idea for wallet-based sign-in (MetaMask/Phantom): identity is the
// (chain, address) pair instead of a provider user id.
export const findOrCreateWalletUser = async (chain: string, address: string): Promise<PublicUser> => {
  const [existing] = await db.select({ id: schema.users.id, username: schema.users.username })
    .from(schema.walletAccounts)
    .innerJoin(schema.users, eq(schema.users.id, schema.walletAccounts.userId))
    .where(and(eq(schema.walletAccounts.chain, chain), eq(schema.walletAccounts.address, address)))
  if (existing) return existing

  const username = await uniqueUsername(`${chain}_${address.slice(-6)}`)
  return db.transaction(async tx => {
    const [row] = await tx.insert(schema.users).values({ username }).returning({ id: schema.users.id })
    await tx.insert(schema.walletAccounts).values({ userId: row.id, chain, address })
    await provisionWallet(tx, row.id)
    return { id: row.id, username }
  })
}
