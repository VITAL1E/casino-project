// The wallet: the ONLY place that changes a balance. Everything that moves
// money (bets, payouts, refunds, resets, sports settlement, signup bonus) goes
// through the functions below, so these rules hold for every game:
//
//  - atomic: the wallet row is locked (`.for('update')`) inside a transaction, so
//    concurrent requests for one user serialize instead of racing a read-modify-write;
//  - audited: every change writes one ledger row in the same transaction;
//  - idempotent: an operation carries a unique `ref` (match id, bet id, join id...).
//    Repeating the same (user, reason, ref) is a no-op that returns the current
//    balance, so a retry or a crash/restart can never pay or charge twice. A unique
//    index on the ledger is the backstop;
//  - bounded: a rolling daily net-loss limit is enforced here, so no game can bypass it;
//  - verifiable: balance == sum(ledger) for every user (see verifyLedger).
import { and, eq, gt, inArray, sql } from 'drizzle-orm'
import { db, schema } from './db'
import { PublicError } from './security'

export const START_BALANCE = 1000
export const limits = {
  dailyLoss: Number(process.env.WALLET_DAILY_LOSS_LIMIT ?? 20_000),   // max rolling-24h net loss per user
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Reason = 'signup_bonus' | 'reset' | 'bet' | 'payout' | 'refund' | 'adjustment' | 'reward'

const round2 = (n: number) => Math.round(n * 100) / 100
const run = <T>(tx: Tx | undefined, fn: (tx: Tx) => Promise<T>): Promise<T> => (tx ? fn(tx) : db.transaction(fn))

export const getBalance = async (userId: string): Promise<number> => {
  const [row] = await db.select({ balance: schema.wallets.balance })
    .from(schema.wallets).where(eq(schema.wallets.userId, userId))
  if (!row) throw new PublicError('unknown user')
  return round2(Number(row.balance))
}

const lockWallet = async (tx: Tx, userId: string) => {
  const [row] = await tx.select({ balance: schema.wallets.balance })
    .from(schema.wallets).where(eq(schema.wallets.userId, userId)).for('update')
  if (!row) throw new PublicError('unknown user')
  return round2(Number(row.balance))
}

const record = async (tx: Tx, userId: string, balance: number, delta: number, reason: Reason, ref: string | null) => {
  const next = round2(balance + delta)
  await tx.update(schema.wallets).set({ balance: String(next) }).where(eq(schema.wallets.userId, userId))
  await tx.insert(schema.ledger).values({ userId, amount: String(delta), reason, roundId: ref, balanceAfter: String(next) })
  return next
}

// Applies one ledger entry. Returns the balance after it (unchanged when the entry already exists).
const apply = async (tx: Tx, userId: string, delta: number, reason: Reason, ref: string): Promise<number> => {
  if (!ref) throw new Error('wallet entries need a ref')
  const balance = await lockWallet(tx, userId)

  const [dup] = await tx.select({ id: schema.ledger.id }).from(schema.ledger)
    .where(and(eq(schema.ledger.userId, userId), eq(schema.ledger.reason, reason), eq(schema.ledger.roundId, ref)))
  if (dup) return balance   // already applied: idempotent replay

  if (round2(balance + delta) < 0) throw new PublicError('insufficient balance')
  return record(tx, userId, balance, delta, reason, ref)
}

// Takes a stake. `ref` identifies this bet (match / session / bet id).
export const debit = (userId: string, amount: number, ref: string, tx?: Tx): Promise<number> => {
  const a = round2(amount)
  if (!(a >= 0.01)) throw new PublicError('bad amount')
  return run(tx, async t => {
    await lockWallet(t, userId)   // serialize with other writers before the limit read below
    const [r] = await t.select({ net: sql<string>`coalesce(sum(${schema.ledger.amount}), 0)` }).from(schema.ledger)
      .where(and(
        eq(schema.ledger.userId, userId),
        gt(schema.ledger.createdAt, sql`now() - interval '24 hours'`),
        inArray(schema.ledger.reason, ['bet', 'payout', 'refund']),
      ))
    const [dup] = await t.select({ id: schema.ledger.id }).from(schema.ledger)
      .where(and(eq(schema.ledger.userId, userId), eq(schema.ledger.reason, 'bet'), eq(schema.ledger.roundId, ref)))
    if (!dup && Number(r.net) - a < -limits.dailyLoss) throw new PublicError('daily loss limit reached')
    return apply(t, userId, -a, 'bet', ref)
  })
}

// Pays out winnings. `ref` identifies the round: paying the same round twice is a no-op.
export const credit = (userId: string, amount: number, ref: string, tx?: Tx): Promise<number> =>
  run(tx, t => apply(t, userId, Math.max(0, round2(amount)), 'payout', ref))

// Returns a stake that was taken but never played (left the queue, run never started...).
export const refund = (userId: string, amount: number, ref: string, tx?: Tx): Promise<number> =>
  run(tx, t => apply(t, userId, Math.max(0, round2(amount)), 'refund', ref))

// Credits a reward (challenge, VIP level-up). Same idempotency rule: one reward per ref.
export const reward = (userId: string, amount: number, ref: string, tx?: Tx): Promise<number> =>
  run(tx, t => apply(t, userId, Math.max(0, round2(amount)), 'reward', ref))

// Play-money top-up: sets the balance to START_BALANCE and records the difference.
export const reset = (userId: string): Promise<number> =>
  db.transaction(async tx => {
    const balance = await lockWallet(tx, userId)
    const delta = round2(START_BALANCE - balance)
    if (delta !== 0) await record(tx, userId, balance, delta, 'reset', null)
    return START_BALANCE
  })

// Signup: creates the wallet row plus its bonus entry. Runs inside the caller's user-creation transaction.
export const provision = async (tx: Tx, userId: string): Promise<void> => {
  await tx.insert(schema.wallets).values({ userId, balance: String(START_BALANCE) })
  await tx.insert(schema.ledger).values({
    userId, amount: String(START_BALANCE), reason: 'signup_bonus', roundId: `signup:${userId}`, balanceAfter: String(START_BALANCE),
  })
}

// Every wallet must equal the sum of its ledger. Returns the ones that do not.
export const verifyLedger = async () => {
  const sum = sql<string>`coalesce(sum(${schema.ledger.amount}), 0)`
  return db.select({ userId: schema.wallets.userId, balance: schema.wallets.balance, ledgerSum: sum })
    .from(schema.wallets)
    .leftJoin(schema.ledger, eq(schema.ledger.userId, schema.wallets.userId))
    .groupBy(schema.wallets.userId, schema.wallets.balance)
    .having(sql`${schema.wallets.balance} <> ${sum}`)
}

// Boot + hourly invariant check: a mismatch means money moved outside this module (or a bug).
export const startLedgerAudit = () => {
  const check = () => verifyLedger()
    .then(bad => { if (bad.length) console.error('LEDGER MISMATCH', bad) })
    .catch(e => console.error('ledger audit failed', e))
  void check()
  setInterval(check, 60 * 60_000).unref()
}
