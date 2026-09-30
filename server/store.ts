// Wallet store backed by Postgres via Drizzle. Debit/credit run inside a
// transaction with `.for('update')` so concurrent requests for the same
// user serialize on the row instead of racing a read-modify-write, and
// every change is recorded in the ledger table for audit.
import { eq } from 'drizzle-orm'
import { db, schema } from './db'
import { PublicError } from './security'

const round2 = (n: number) => Math.round(n * 100) / 100

export const getBalance = async (userId: string): Promise<number> => {
  const [row] = await db.select({ balance: schema.wallets.balance })
    .from(schema.wallets).where(eq(schema.wallets.userId, userId))
  if (!row) throw new PublicError('unknown user')
  return round2(Number(row.balance))
}

export const resetBalance = async (userId: string, amount = 1000): Promise<number> => {
  return db.transaction(async tx => {
    const [row] = await tx.update(schema.wallets)
      .set({ balance: String(amount) })
      .where(eq(schema.wallets.userId, userId))
      .returning({ balance: schema.wallets.balance })
    if (!row) throw new PublicError('unknown user')

    await tx.insert(schema.ledger).values({
      userId, amount: String(amount), reason: 'reset', balanceAfter: String(amount),
    })
    return round2(Number(row.balance))
  })
}

const adjust = async (
  userId: string,
  delta: number,
  reason: 'bet' | 'payout' | 'refund',
  roundId: string | null,
): Promise<number> => {
  return db.transaction(async tx => {
    const [row] = await tx.select({ balance: schema.wallets.balance })
      .from(schema.wallets).where(eq(schema.wallets.userId, userId)).for('update')
    if (!row) throw new PublicError('unknown user')

    const next = round2(Number(row.balance) + delta)
    if (next < 0) throw new PublicError('insufficient balance')

    await tx.update(schema.wallets).set({ balance: String(next) }).where(eq(schema.wallets.userId, userId))
    await tx.insert(schema.ledger).values({
      userId, amount: String(delta), reason, roundId, balanceAfter: String(next),
    })
    return next
  })
}

// throws if the balance would go negative — callers must catch this
export const debit = (userId: string, amount: number, roundId?: string) => {
  if (!(round2(amount) >= 0.01)) throw new PublicError('bad amount')
  return adjust(userId, -amount, 'bet', roundId ?? null)
}

export const credit = (userId: string, amount: number, roundId?: string) =>
  adjust(userId, Math.max(0, round2(amount)), 'payout', roundId ?? null)

// returns a stake that was taken but never played (e.g. left the matchmaking queue)
export const refund = (userId: string, amount: number, roundId?: string) =>
  adjust(userId, Math.max(0, round2(amount)), 'refund', roundId ?? null)
