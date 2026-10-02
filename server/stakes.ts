// Stakes: money that is on the table for a game that lives in server memory (an arcade match, a solo run).
//
// placeStake debits the wallet and records the stake in ONE transaction; closeStake records the outcome and
// pays out in ONE transaction. A stake can therefore only be in two honest states: open (the game is still
// running) or closed with its payout. If the server dies mid-game the match is gone, so at the next boot
// recoverStakes refunds every stake that is still open instead of silently keeping it.
//
// Single instance assumption: at boot no game can be running, so every open stake is an orphan. With several
// server instances each stake would need to carry its instance id first.
import { and, eq, inArray, notLike } from 'drizzle-orm'
import { db, schema } from './db'
import { credit, debit, getBalance, refund } from './wallet'
import { recordPlaced, recordResult } from './rewards/progress'
import { gameKey } from './rewards/defs'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Outcome = 'won' | 'lost' | 'refunded'

const round2 = (n: number) => Math.round(n * 100) / 100

// Takes the stake. `ref` must be unique per stake (it is also the idempotency ref of the wallet entries).
export const placeStake = (userId: string, game: string, amount: number, ref: string, tx?: Tx): Promise<number> => {
  const body = async (t: Tx) => {
    const balance = await debit(userId, amount, ref, t)
    await t.insert(schema.stakes).values({ id: ref, userId, game, amount: String(round2(amount)) }).onConflictDoNothing()
    return balance
  }
  return tx ? body(tx) : db.transaction(body)
}

// Closes an open stake exactly once. Returns the balance afterwards; a stake that was already closed changes nothing.
// 'won' pays `payout`, 'refunded' gives the stake back, 'lost' just closes it.
export const closeStake = (userId: string, ref: string, outcome: Outcome, payout = 0, tx?: Tx): Promise<number> => {
  const body = async (t: Tx) => {
    const [row] = await t.update(schema.stakes)
      .set({ status: outcome, closedAt: new Date() })
      .where(and(eq(schema.stakes.id, ref), eq(schema.stakes.userId, userId), eq(schema.stakes.status, 'open')))
      .returning({ amount: schema.stakes.amount, game: schema.stakes.game })
    if (!row) return getBalance(userId)   // unknown or already closed

    // wagers, stats and challenge progress move in the same transaction as the money (a refund is not a wager)
    const game = gameKey(row.game)
    if (outcome === 'won') {
      await recordPlaced(t, userId, game, Number(row.amount))
      await recordResult(t, userId, game, Number(row.amount), payout)
      return credit(userId, payout, ref, t)
    }
    if (outcome === 'refunded') return refund(userId, Number(row.amount), ref, t)
    await recordPlaced(t, userId, game, Number(row.amount))
    return getBalance(userId)
  }
  return tx ? body(tx) : db.transaction(body)
}

// Boot-time recovery: refund every stake whose game died with the previous process.
// `onlyUsers` narrows it (used by tests so they never touch another process's live stakes).
// Stakes of persisted classic rounds ('classic-round:*', e.g. Mines) are skipped: their state is in the database, so
// the player just continues after a restart (stale ones are refunded by the classics sweeper instead).
export const recoverStakes = async (onlyUsers?: string[]): Promise<number> => {
  const open = await db.select().from(schema.stakes)
    .where(and(eq(schema.stakes.status, 'open'), notLike(schema.stakes.game, 'classic-round:%'), onlyUsers ? inArray(schema.stakes.userId, onlyUsers) : undefined))
  for (const s of open) {
    try {
      await closeStake(s.userId, s.id, 'refunded')
      console.log(`refunded orphaned ${s.game} stake ${s.id}: ${s.amount}`)
    } catch (e) {
      console.error('could not refund stake', s.id, e)
    }
  }
  return open.length
}
