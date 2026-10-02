// Challenges, stats and VIP rewards against the real Postgres; throwaway users are deleted afterwards.
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, migrate, pool, schema } from '../db'
import { getBalance, provision, verifyLedger } from '../wallet'
import { closeStake, placeStake } from '../stakes'
import { recordPlaced } from '../rewards/progress'
import { claimChallenge, claimVip, getChallenges, getVip } from '../rewards/service'
import { CHALLENGES, TIERS, periodOf, tierFor } from '../rewards/defs'

const created: string[] = []
const newUser = async () => {
  const [u] = await db.insert(schema.users).values({ username: `r_${randomUUID().slice(0, 12)}` }).returning({ id: schema.users.id })
  await db.transaction(tx => provision(tx, u.id))
  created.push(u.id)
  return u.id
}
const ledgerOk = async (userId: string) => !(await verifyLedger()).some(r => r.userId === userId)
// plays one round: takes a stake of `stake` on `game` and settles it
const play = async (userId: string, game: string, stake: number, outcome: 'won' | 'lost' | 'refunded', payout = 0) => {
  const ref = randomUUID()
  await placeStake(userId, game, stake, ref)
  await closeStake(userId, ref, outcome, payout)
}
const challenge = async (userId: string, id: string) => (await getChallenges(userId)).challenges.find(c => c.id === id)!

beforeAll(async () => { await migrate() })
afterAll(async () => {
  for (const id of created) await db.delete(schema.users).where(eq(schema.users.id, id))
  await pool.end()
})

describe('definitions', () => {
  it('tiers are ordered and the level follows lifetime wagering', () => {
    expect(TIERS.map(t => t.min)).toEqual([...TIERS.map(t => t.min)].sort((a, b) => a - b))
    expect(tierFor(0).key).toBe('bronze')
    expect(tierFor(999.99).key).toBe('bronze')
    expect(tierFor(1000).key).toBe('silver')
    expect(tierFor(10_000_000).key).toBe('diamond')
  })
  it('every challenge has a unique id and a positive target and reward', () => {
    expect(new Set(CHALLENGES.map(c => c.id)).size).toBe(CHALLENGES.length)
    expect(CHALLENGES.every(c => c.target > 0 && c.reward > 0)).toBe(true)
  })
})

describe('challenges', () => {
  it('counts wagers, claims once, and pays through the wallet', async () => {
    const u = await newUser()
    await play(u, 'classic:dice', 60, 'lost')
    expect((await challenge(u, 'wager-100')).progress).toBe(60)
    expect((await challenge(u, 'wager-100')).done).toBe(false)
    await expect(claimChallenge(u, 'wager-100')).rejects.toThrow('not completed')

    await play(u, 'classic:dice', 60, 'lost')
    const c = await challenge(u, 'wager-100')
    expect(c.done).toBe(true)
    expect(c.progress).toBe(100)                                     // capped at the target

    const before = await getBalance(u)
    const r = await claimChallenge(u, 'wager-100')
    expect(r.reward).toBe(10)
    expect(r.balance).toBe(before + 10)
    await expect(claimChallenge(u, 'wager-100')).rejects.toThrow('already claimed')
    expect((await challenge(u, 'wager-100')).claimed).toBe(true)
    expect(await ledgerOk(u)).toBe(true)
  })

  it('a double click on claim pays the reward only once', async () => {
    const u = await newUser()
    await play(u, 'agar', 100, 'lost')
    const results = await Promise.allSettled([claimChallenge(u, 'wager-100'), claimChallenge(u, 'wager-100'), claimChallenge(u, 'wager-100')])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(await getBalance(u)).toBe(1000 - 100 + 10)
    expect(await ledgerOk(u)).toBe(true)
  })

  it('only counts the right games, and refunds are not wagers', async () => {
    const u = await newUser()
    await play(u, 'classic:dice', 10, 'lost')                        // a classic: no arcade progress
    expect((await challenge(u, 'arcade-match')).progress).toBe(0)
    await play(u, 'slither', 10, 'refunded')                         // refunded: counts for nothing
    expect((await challenge(u, 'arcade-match')).progress).toBe(0)
    expect((await challenge(u, 'wager-100')).progress).toBe(10)
    await play(u, 'slither', 10, 'lost')
    expect((await challenge(u, 'arcade-match')).done).toBe(true)
    expect((await challenge(u, 'arcade-win')).progress).toBe(0)
    await play(u, 'storm', 10, 'won', 100)
    expect((await challenge(u, 'arcade-win')).done).toBe(true)
  })

  it('wins and multiplier challenges', async () => {
    const u = await newUser()
    await play(u, 'classic:limbo', 10, 'won', 30)                    // 3x
    expect((await challenge(u, 'classic-5x')).progress).toBe(3)
    expect((await challenge(u, 'classic-5x')).done).toBe(false)
    await play(u, 'classic:limbo', 10, 'won', 25)                    // 2.5x: does not lower the best
    expect((await challenge(u, 'classic-5x')).progress).toBe(3)
    await play(u, 'classic-round:mines', 10, 'won', 70)              // 7x
    expect((await challenge(u, 'classic-5x')).done).toBe(true)
    expect((await challenge(u, 'win-3')).done).toBe(true)            // three wins so far
    await play(u, 'agar', 10, 'won', 10)                             // payout == stake is not a win
    expect((await challenge(u, 'win-3')).progress).toBe(3)
  })

  it('sports bets count when placed', async () => {
    const u = await newUser()
    await db.transaction(tx => recordPlaced(tx, u, 'sports', 5))
    expect((await challenge(u, 'sports-bet')).done).toBe(true)
  })

  it('progress is per day: yesterday\'s rows do not count today', async () => {
    const u = await newUser()
    await db.insert(schema.challengeProgress).values({ userId: u, challengeId: 'wager-100', period: '2000-01-01', progress: '100' })
    expect(periodOf()).not.toBe('2000-01-01')
    expect((await challenge(u, 'wager-100')).progress).toBe(0)
  })
})

describe('vip', () => {
  it('starts at bronze and moves up with lifetime wagering', async () => {
    const u = await newUser()
    expect((await getVip(u)).level.key).toBe('bronze')
    expect((await getVip(u)).next?.remaining).toBe(1000)
    for (let i = 0; i < 10; i++) await play(u, 'classic:dice', 100, 'lost')
    const vip = await getVip(u)
    expect(vip.wagered).toBe(1000)
    expect(vip.level.key).toBe('silver')
    expect(vip.claimable).toBe(25)
  })

  it('pays each level-up reward exactly once, even when claims race', async () => {
    const u = await newUser()
    for (let i = 0; i < 10; i++) await play(u, 'classic:dice', 100, 'won', 100.01)   // wagers 1000, wins stay even-ish
    const before = await getBalance(u)
    const results = await Promise.all([claimVip(u), claimVip(u), claimVip(u), claimVip(u)])
    expect(results.reduce((s, r) => s + r.credited, 0)).toBe(25)
    expect(await getBalance(u)).toBe(before + 25)
    expect((await claimVip(u)).credited).toBe(0)
    expect((await getVip(u)).claimable).toBe(0)
    expect(await ledgerOk(u)).toBe(true)
  })
})
