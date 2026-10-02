// Provably fair randomness for the classic games.
//
// Every user has a secret server seed (only its SHA-256 hash is shown while it is active), a client seed they can
// choose, and a nonce that goes up by one for every bet. The random numbers of a bet are
//   HMAC-SHA256(serverSeed, "<clientSeed>:<nonce>:<round>")  ->  bytes -> floats in [0, 1)
// so once the user rotates the server seed (which reveals it) they can recompute every outcome themselves and check
// that the revealed seed matches the hash they saw before playing: the casino could not have changed the outcome
// after seeing the bet.
import { createHash, createHmac, randomBytes } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '../db'
import { PublicError } from '../security'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type Proof = { nonce: number; clientSeed: string; serverSeedHash: string }
export type Rng = { next: () => number }

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const newServerSeed = () => randomBytes(32).toString('hex')

// 8 floats per HMAC round; later rounds are only computed when a game needs more numbers.
export const makeRng = (serverSeed: string, clientSeed: string, nonce: number): Rng => {
  let round = 0
  let buf: number[] = []
  return {
    next: () => {
      if (buf.length === 0) {
        const bytes = createHmac('sha256', serverSeed).update(`${clientSeed}:${nonce}:${round++}`).digest()
        buf = []
        for (let i = 0; i < 8; i++) {
          buf.push(bytes[4 * i] / 256 + bytes[4 * i + 1] / 256 ** 2 + bytes[4 * i + 2] / 256 ** 3 + bytes[4 * i + 3] / 256 ** 4)
        }
      }
      return buf.shift()!
    },
  }
}

// Fisher-Yates over 0..n-1 driven by the rng: the first `take` entries are a uniform random sample.
export const sample = (rng: Rng, n: number, take: number): number[] => {
  const a = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > n - 1 - take && i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(n - take)
}

const ensureRow = async (tx: Tx, userId: string) => {
  const serverSeed = newServerSeed()
  await tx.insert(schema.fairSeeds).values({
    userId, serverSeed, serverSeedHash: sha256(serverSeed), clientSeed: randomBytes(8).toString('hex'), nonce: 0,
  }).onConflictDoNothing()
}

const lockRow = async (tx: Tx, userId: string) => {
  await ensureRow(tx, userId)
  const [row] = await tx.select().from(schema.fairSeeds).where(eq(schema.fairSeeds.userId, userId)).for('update')
  return row
}

// What the user may see: never the active server seed.
export const getFair = async (userId: string) =>
  db.transaction(async tx => {
    const r = await lockRow(tx, userId)
    return { serverSeedHash: r.serverSeedHash, clientSeed: r.clientSeed, nonce: r.nonce, previous: r.previous as unknown }
  })

// Takes the next nonce for a bet and returns the seeds to draw its numbers from (serverSeed stays on the server).
// Pass `outer` to hold the seed row lock until the caller's transaction commits (so rotate() cannot interleave).
export const nextBet = async (userId: string, outer?: Tx): Promise<{ rng: Rng; proof: Proof }> => {
  const take = async (tx: Tx) => {
    const r = await lockRow(tx, userId)
    await tx.update(schema.fairSeeds).set({ nonce: r.nonce + 1 }).where(eq(schema.fairSeeds.userId, userId))
    return {
      rng: makeRng(r.serverSeed, r.clientSeed, r.nonce),
      proof: { nonce: r.nonce, clientSeed: r.clientSeed, serverSeedHash: r.serverSeedHash },
    }
  }
  return outer ? take(outer) : db.transaction(take)
}

// Rebuilds the rng of a stored round (used to continue Mines / HiLo / Blackjack after the first deal).
export const rngFor = async (userId: string, proof: Proof): Promise<Rng> => {
  const [r] = await db.select().from(schema.fairSeeds).where(eq(schema.fairSeeds.userId, userId))
  if (r && r.serverSeedHash === proof.serverSeedHash) return makeRng(r.serverSeed, proof.clientSeed, proof.nonce)
  const prev = r?.previous as { serverSeed: string; serverSeedHash: string } | null
  if (prev && prev.serverSeedHash === proof.serverSeedHash) return makeRng(prev.serverSeed, proof.clientSeed, proof.nonce)
  throw new PublicError('seed no longer available')
}

export const setClientSeed = async (userId: string, clientSeed: unknown) => {
  if (typeof clientSeed !== 'string' || clientSeed.length < 1 || clientSeed.length > 64 || /[\u0000-\u001f]/.test(clientSeed)) {
    throw new PublicError('client seed must be 1-64 printable characters')
  }
  return db.transaction(async tx => {
    const r = await lockRow(tx, userId)
    // The nonce is never reset under the same server seed: (clientSeed, nonce) pairs must stay unique, otherwise
    // switching back to an old client seed would replay outcomes the player already knows.
    await tx.update(schema.fairSeeds).set({ clientSeed }).where(eq(schema.fairSeeds.userId, userId))
    return { serverSeedHash: r.serverSeedHash, clientSeed, nonce: r.nonce }
  })
}

// Reveals the active server seed and starts a fresh one. Refused while a stateful round (Mines, HiLo, Blackjack)
// is still using the seed, so nobody can peek at an unfinished board.
export const rotate = async (userId: string) =>
  db.transaction(async tx => {
    const r = await lockRow(tx, userId)
    const active = await tx.select({ id: schema.classicRounds.id }).from(schema.classicRounds)
      .where(and(eq(schema.classicRounds.userId, userId), eq(schema.classicRounds.status, 'active')))
    if (active.length) throw new PublicError('finish your current round before rotating the seed')
    // Crash runs live on the server (not in classic_rounds) but draw from this seed: revealing it mid-run would show the crash point
    const open = await tx.select({ id: schema.stakes.id }).from(schema.stakes)
      .where(and(eq(schema.stakes.userId, userId), eq(schema.stakes.status, 'open'), eq(schema.stakes.game, 'crash')))
    if (open.length) throw new PublicError('finish your current round before rotating the seed')
    const previous = { serverSeed: r.serverSeed, serverSeedHash: r.serverSeedHash, clientSeed: r.clientSeed, nonce: r.nonce }
    const serverSeed = newServerSeed()
    await tx.update(schema.fairSeeds).set({ serverSeed, serverSeedHash: sha256(serverSeed), nonce: 0, previous }).where(eq(schema.fairSeeds.userId, userId))
    return { previous, serverSeedHash: sha256(serverSeed), clientSeed: r.clientSeed, nonce: 0 }
  })
