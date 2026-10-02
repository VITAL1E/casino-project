// Runs against the real Postgres from DATABASE_URL; creates throwaway users and deletes them afterwards.
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, migrate, pool, schema } from '../db'
import { START_BALANCE, getBalance, provision, verifyLedger } from '../wallet'
import { closeStake, placeStake, recoverStakes } from '../stakes'

const created: string[] = []
const newUser = async () => {
  const [u] = await db.insert(schema.users).values({ username: `s_${randomUUID().slice(0, 12)}` }).returning({ id: schema.users.id })
  await db.transaction(tx => provision(tx, u.id))
  created.push(u.id)
  return u.id
}
const stakeOf = async (ref: string) => (await db.select().from(schema.stakes).where(eq(schema.stakes.id, ref)))[0]
const ledgerOk = async (userId: string) => !(await verifyLedger()).some(r => r.userId === userId)

beforeAll(async () => { await migrate() })
afterAll(async () => {
  for (const id of created) await db.delete(schema.users).where(eq(schema.users.id, id))
  await pool.end()
})

describe('stakes', () => {
  it('opens a stake together with the debit, and a win closes it and pays once', async () => {
    const u = await newUser()
    const ref = randomUUID()
    expect(await placeStake(u, 'agar', 10, ref)).toBe(990)
    expect((await stakeOf(ref)).status).toBe('open')

    expect(await closeStake(u, ref, 'won', 100)).toBe(1090)
    expect((await stakeOf(ref)).status).toBe('won')
    expect(await closeStake(u, ref, 'won', 100)).toBe(1090)       // replay: no second payout
    expect(await closeStake(u, ref, 'refunded')).toBe(1090)        // already closed: cannot be refunded on top
    expect(await ledgerOk(u)).toBe(true)
  })

  it('a loss just closes the stake; a refund gives it back exactly once', async () => {
    const u = await newUser()
    const lost = randomUUID(), refunded = randomUUID()
    await placeStake(u, 'hole', 20, lost)
    await placeStake(u, 'hole', 30, refunded)
    expect(await closeStake(u, lost, 'lost')).toBe(950)
    expect(await closeStake(u, refunded, 'refunded')).toBe(980)
    expect(await closeStake(u, refunded, 'refunded')).toBe(980)
    expect((await stakeOf(lost)).status).toBe('lost')
    expect((await stakeOf(refunded)).status).toBe('refunded')
    expect(await ledgerOk(u)).toBe(true)
  })

  it('only one of two racing closes wins', async () => {
    const u = await newUser()
    const ref = randomUUID()
    await placeStake(u, 'paper', 10, ref)
    await Promise.all([closeStake(u, ref, 'won', 100), closeStake(u, ref, 'refunded'), closeStake(u, ref, 'won', 100)])
    const final = await getBalance(u)
    expect([START_BALANCE - 10 + 100, START_BALANCE]).toContain(final)   // either the payout or the refund, never both
    expect(await ledgerOk(u)).toBe(true)
  })

  it('refuses a stake the wallet cannot cover and leaves nothing open', async () => {
    const u = await newUser()
    const ref = randomUUID()
    await expect(placeStake(u, 'storm', 5000, ref)).rejects.toThrow('insufficient balance')
    expect(await stakeOf(ref)).toBeUndefined()
    expect(await getBalance(u)).toBe(START_BALANCE)
  })

  it('recoverStakes refunds open stakes after a crash, once', async () => {
    const u = await newUser()
    const a = randomUUID(), b = randomUUID(), done = randomUUID()
    await placeStake(u, 'chicken', 10, a)
    await placeStake(u, 'slither', 25, b)
    await placeStake(u, 'flappy', 5, done)
    await closeStake(u, done, 'lost')
    expect(await getBalance(u)).toBe(960)

    expect(await recoverStakes([u])).toBe(2)
    expect(await getBalance(u)).toBe(995)                          // 10 + 25 back, the lost one stays lost
    expect((await stakeOf(a)).status).toBe('refunded')
    expect((await stakeOf(done)).status).toBe('lost')
    expect(await recoverStakes([u])).toBe(0)                       // nothing left to recover
    expect(await ledgerOk(u)).toBe(true)
  })
})
