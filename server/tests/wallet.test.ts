// Runs against the real Postgres from DATABASE_URL (the same one `npm run server` uses).
// Each test creates its own throwaway user and the afterAll hook deletes them again (wallet + ledger cascade).
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, migrate, pool, schema } from '../db'
import { START_BALANCE, credit, debit, getBalance, limits, provision, refund, reset, verifyLedger } from '../wallet'

const created: string[] = []

const newUser = async () => {
  const [u] = await db.insert(schema.users).values({ username: `t_${randomUUID().slice(0, 12)}` }).returning({ id: schema.users.id })
  await db.transaction(tx => provision(tx, u.id))
  created.push(u.id)
  return u.id
}

const ledgerOf = (userId: string) => db.select().from(schema.ledger).where(eq(schema.ledger.userId, userId))
const mismatch = async (userId: string) => (await verifyLedger()).some(r => r.userId === userId)

beforeAll(async () => { await migrate() })
afterAll(async () => {
  for (const id of created) await db.delete(schema.users).where(eq(schema.users.id, id))
  await pool.end()
})

describe('wallet', () => {
  it('provisions a wallet with a signup bonus entry', async () => {
    const u = await newUser()
    expect(await getBalance(u)).toBe(START_BALANCE)
    const rows = await ledgerOf(u)
    expect(rows).toHaveLength(1)
    expect(rows[0].reason).toBe('signup_bonus')
    expect(await mismatch(u)).toBe(false)
  })

  it('debits, credits and refunds, writing one ledger row each', async () => {
    const u = await newUser()
    expect(await debit(u, 10, 'r1')).toBe(990)
    expect(await credit(u, 25.5, 'r1')).toBe(1015.5)
    expect(await debit(u, 5, 'r2')).toBe(1010.5)
    expect(await refund(u, 5, 'r2')).toBe(1015.5)
    expect((await ledgerOf(u)).map(r => r.reason).sort()).toEqual(['bet', 'bet', 'payout', 'refund', 'signup_bonus'])
    expect(await mismatch(u)).toBe(false)
  })

  it('is idempotent: the same (reason, ref) is applied once', async () => {
    const u = await newUser()
    expect(await debit(u, 100, 'same')).toBe(900)
    expect(await debit(u, 100, 'same')).toBe(900)          // replayed stake: not charged again
    expect(await credit(u, 300, 'same')).toBe(1200)
    expect(await credit(u, 300, 'same')).toBe(1200)        // replayed payout: not paid twice
    expect(await refund(u, 100, 'same')).toBe(1300)
    expect(await refund(u, 100, 'same')).toBe(1300)
    expect(await ledgerOf(u)).toHaveLength(4)
    expect(await mismatch(u)).toBe(false)
  })

  it('stays idempotent under concurrent duplicates', async () => {
    const u = await newUser()
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => credit(u, 50, 'dup-race')))
    expect(results.every(r => r.status === 'fulfilled')).toBe(true)
    expect(await getBalance(u)).toBe(1050)
    expect(await mismatch(u)).toBe(false)
  })

  it('rejects a stake above the balance and leaves the balance alone', async () => {
    const u = await newUser()
    await expect(debit(u, 5000, 'big')).rejects.toThrow('insufficient balance')
    expect(await getBalance(u)).toBe(START_BALANCE)
    expect(await ledgerOf(u)).toHaveLength(1)
  })

  it('rejects zero, negative and sub-cent amounts', async () => {
    const u = await newUser()
    for (const bad of [0, -5, 0.001, Number.NaN]) expect(() => debit(u, bad, `bad-${bad}`)).toThrow('bad amount')
    expect(await getBalance(u)).toBe(START_BALANCE)
  })

  it('never overdraws when debits race', async () => {
    const u = await newUser()
    const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => debit(u, 100, `race-${i}`)))
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(10)
    expect(await getBalance(u)).toBe(0)
    expect(await mismatch(u)).toBe(false)
  })

  it('reset records the difference, so the ledger still adds up', async () => {
    const u = await newUser()
    await debit(u, 400, 'lose')
    expect(await reset(u)).toBe(START_BALANCE)
    expect(await getBalance(u)).toBe(START_BALANCE)
    expect(await mismatch(u)).toBe(false)
    await credit(u, 5000, 'win')
    expect(await reset(u)).toBe(START_BALANCE)   // also works from above the start balance
    expect(await mismatch(u)).toBe(false)
  })

  it('enforces the rolling daily net-loss limit', async () => {
    const u = await newUser()
    const old = limits.dailyLoss
    limits.dailyLoss = 300
    try {
      await debit(u, 200, 'l1')
      await debit(u, 100, 'l2')                                   // net loss now exactly 300
      await expect(debit(u, 1, 'l3')).rejects.toThrow('daily loss limit reached')
      await credit(u, 150, 'l1')                                   // a win lowers the net loss again
      await expect(debit(u, 50, 'l4')).resolves.toBeTypeOf('number')
      expect(await debit(u, 200, 'l1')).toBeTypeOf('number')      // a replay of a charged stake is never blocked
    } finally {
      limits.dailyLoss = old
    }
  })

  it('verifyLedger flags a wallet that changed outside the wallet module', async () => {
    const u = await newUser()
    expect(await mismatch(u)).toBe(false)
    await db.update(schema.wallets).set({ balance: '1234.56' }).where(eq(schema.wallets.userId, u))
    expect(await mismatch(u)).toBe(true)
  })

  it('can take part in a caller transaction (sports settlement style)', async () => {
    const u = await newUser()
    await expect(db.transaction(async tx => {
      await credit(u, 70, 'tx-1', tx)
      throw new Error('boom')                                      // rolls the payout back
    })).rejects.toThrow('boom')
    expect(await getBalance(u)).toBe(START_BALANCE)
    await db.transaction(tx => credit(u, 70, 'tx-1', tx))
    expect(await getBalance(u)).toBe(START_BALANCE + 70)
  })
})
