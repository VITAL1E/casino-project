// A sports bet is one transaction: if any step fails the stake is not taken.
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { db, migrate, pool, schema } from '../db'
import { getBalance, provision, verifyLedger } from '../wallet'

vi.mock('../sports/oddsApi', () => ({
  findEvent: async () => ({
    id: 'e1', sportKey: 'k', homeTeam: 'H', awayTeam: 'A', commenceTime: new Date(Date.now() + 3_600_000).toISOString(),
    outcomes: [{ name: 'H', price: 2 }],
  }),
}))
vi.mock('../rewards/progress', () => ({
  recordPlaced: async () => { throw new Error('boom') },
  recordResult: async () => undefined,
}))

const { placeBet, listBets } = await import('../sports/bets')

const created: string[] = []
beforeAll(async () => { await migrate() })
afterAll(async () => {
  for (const id of created) await db.delete(schema.users).where(eq(schema.users.id, id))
  await pool.end()
})

describe('placeBet', () => {
  it('rolls back the debit when a later step fails', async () => {
    const [u] = await db.insert(schema.users).values({ username: `s_${randomUUID().slice(0, 12)}` }).returning({ id: schema.users.id })
    await db.transaction(tx => provision(tx, u.id))
    created.push(u.id)
    const before = await getBalance(u.id)
    await expect(placeBet(u.id, 'k', 'e1', 'H', 10)).rejects.toThrow()
    expect(await getBalance(u.id)).toBe(before)
    expect(await listBets(u.id)).toHaveLength(0)
    expect((await verifyLedger()).some(r => r.userId === u.id)).toBe(false)
  })
})
