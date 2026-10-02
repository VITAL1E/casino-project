// Money + persistence around the classic games' rules (./games.ts). Every bet is a stake (see ../stakes.ts):
// instant games place it and settle it inside one request; stateful games (Mines, HiLo, Blackjack) keep an
// active round in the database, so a restart never loses a round and the player simply continues.
import { randomUUID } from 'node:crypto'
import { and, eq, lt } from 'drizzle-orm'
import { db, schema } from '../db'
import { PublicError } from '../security'
import { broadcastWin } from '../liveWins'
import { closeStake, placeStake } from '../stakes'
import { instantGame, statefulGame, type Done } from './games'
import { nextBet, type Proof } from './fair'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
const round2 = (n: number) => Math.round(n * 100) / 100
const STALE_MS = 2 * 60 * 60_000   // an abandoned round is refunded after 2 hours
export const MAX_PAYOUT = 1_000_000   // largest payout of one bet (Limbo / Mines multipliers are astronomical)
const cap = (payout: number) => Math.min(payout, MAX_PAYOUT)

const GAMES: Record<string, { label: string; gameId: string }> = {
  dice: { label: 'Dice', gameId: 'o1' }, mines: { label: 'Mines', gameId: 'o2' }, plinko: { label: 'Plinko', gameId: 'o3' },
  keno: { label: 'Keno', gameId: 'o5' }, limbo: { label: 'Limbo', gameId: 'o6' }, hilo: { label: 'HiLo', gameId: 'o7' },
  blackjack: { label: 'Blackjack', gameId: 'o8' }, roulette: { label: 'Roulette', gameId: 'o9' },
}
export const isClassic = (key: string) => !!instantGame(key) || !!statefulGame(key)

const announce = async (userId: string, key: string, payout: number, stake: number) => {
  if (payout <= stake) return
  const [u] = await db.select({ username: schema.users.username }).from(schema.users).where(eq(schema.users.id, userId))
  const g = GAMES[key]
  if (u && g) broadcastWin({ id: randomUUID(), gameId: g.gameId, label: g.label, username: u.username, amount: payout, at: new Date().toISOString() })
}

// ================= instant games =================
export const playInstant = async (userId: string, key: string, body: Record<string, unknown>) => {
  const game = instantGame(key)
  if (!game) throw new PublicError('unknown game')
  const { stake, params } = game.parse(body)
  const ref = randomUUID()
  await placeStake(userId, `classic:${key}`, stake, ref)
  try {
    const { rng, proof } = await nextBet(userId)
    const play = game.play(params, stake, rng)
    const payout = cap(play.payout)
    const details = play.details
    const balance = payout > 0 ? await closeStake(userId, ref, 'won', payout) : await closeStake(userId, ref, 'lost')
    void announce(userId, key, payout, stake).catch(() => undefined)
    return { balance, stake, payout, mult: stake > 0 ? round2(payout / stake) : 0, details, proof }
  } catch (e) {
    await closeStake(userId, ref, 'refunded').catch(() => undefined)   // never keep a stake for a bet that did not play out
    throw e
  }
}

// ================= stateful rounds =================
type Round = typeof schema.classicRounds.$inferSelect

const settle = async (tx: Tx, userId: string, ref: string, bet: number, done: Done): Promise<number> => {
  let balance = 0
  for (const r of [ref, `${ref}:dbl`]) {   // a doubled blackjack hand has a second stake; unknown refs are no-ops
    if (done.outcome === 'won') balance = await closeStake(userId, r, 'won', cap(round2(bet * done.mult)), tx)
    else if (done.outcome === 'refunded') balance = await closeStake(userId, r, 'refunded', 0, tx)
    else balance = await closeStake(userId, r, 'lost', 0, tx)
  }
  return balance
}

const reply = (round: { id: string; bet: number; proof: Proof }, view: Record<string, unknown>, balance: number, done?: Done) => ({
  roundId: round.id, bet: round.bet, proof: round.proof, view, balance,
  ...(done ? { done: { outcome: done.outcome, mult: done.mult, payout: done.outcome === 'won' ? cap(round2(round.bet * done.mult)) : 0 } } : {}),
})

const activeRound = async (tx: Tx | typeof db, userId: string, key: string): Promise<Round | undefined> => {
  const [row] = await tx.select().from(schema.classicRounds)
    .where(and(eq(schema.classicRounds.userId, userId), eq(schema.classicRounds.game, key), eq(schema.classicRounds.status, 'active')))
  return row
}

export const startRound = async (userId: string, key: string, body: Record<string, unknown>) => {
  const game = statefulGame(key)
  if (!game) throw new PublicError('unknown game')
  const { stake, params } = game.parse(body)
  if (await activeRound(db, userId, key)) throw new PublicError('you already have a round in progress')
  const ref = randomUUID()
  await placeStake(userId, `classic-round:${key}`, stake, ref)
  try {
    return await db.transaction(async tx => {
      // drawing the seed and inserting the round share one transaction, so rotate() waits on the seed lock and then sees the round
      const { rng, proof } = await nextBet(userId, tx)
      const step = game.start(params, stake, rng)
      await tx.insert(schema.classicRounds).values({
        id: ref, userId, game: key, bet: String(stake), state: step.state as object, proof, status: step.done ? 'done' : 'active',
      })
      const balance = step.done ? await settle(tx, userId, ref, stake, step.done) : await balanceOf(tx, userId)
      if (step.done?.outcome === 'won') void announce(userId, key, round2(stake * step.done.mult), stake).catch(() => undefined)
      return reply({ id: ref, bet: stake, proof }, step.view, balance, step.done)
    })
  } catch (e) {
    await closeStake(userId, ref, 'refunded').catch(() => undefined)
    throw e
  }
}

const balanceOf = async (tx: Tx, userId: string) => {
  const [w] = await tx.select({ balance: schema.wallets.balance }).from(schema.wallets).where(eq(schema.wallets.userId, userId))
  return round2(Number(w.balance))
}

export const actRound = async (userId: string, key: string, body: Record<string, unknown>) => {
  const game = statefulGame(key)
  if (!game) throw new PublicError('unknown game')
  const action = typeof body.action === 'string' ? body.action : ''
  return db.transaction(async tx => {
    const [row] = await tx.select().from(schema.classicRounds)
      .where(and(eq(schema.classicRounds.userId, userId), eq(schema.classicRounds.game, key), eq(schema.classicRounds.status, 'active')))
      .for('update')
    if (!row) throw new PublicError('no round in progress')
    const bet = Number(row.bet)

    // an action that needs more money (blackjack double) takes it in this same transaction: any failure rolls it back
    const extra = game.needsStake?.(row.state, action, bet) ?? 0
    if (extra > 0) await placeStake(userId, `classic-round:${key}`, extra, `${row.id}:dbl`, tx)

    const step = game.act(row.state, action, body, bet)
    await tx.update(schema.classicRounds)
      .set({ state: step.state as object, status: step.done ? 'done' : 'active', updatedAt: new Date() })
      .where(eq(schema.classicRounds.id, row.id))
    const balance = step.done ? await settle(tx, userId, row.id, bet, step.done) : await balanceOf(tx, userId)
    if (step.done?.outcome === 'won') void announce(userId, key, round2(bet * step.done.mult * (extra > 0 ? 2 : 1)), bet).catch(() => undefined)
    return reply({ id: row.id, bet, proof: row.proof as Proof }, step.view, balance, step.done)
  })
}

export const currentRound = async (userId: string, key: string) => {
  const game = statefulGame(key)
  if (!game) throw new PublicError('unknown game')
  const row = await activeRound(db, userId, key)
  if (!row) return { round: null }
  return { round: { roundId: row.id, bet: Number(row.bet), proof: row.proof as Proof, view: game.view(row.state) } }
}

// Boot + hourly: refund rounds that were abandoned (and make sure no stake is left behind for them).
export const sweepStaleRounds = async (): Promise<number> => {
  const stale = await db.select().from(schema.classicRounds)
    .where(and(eq(schema.classicRounds.status, 'active'), lt(schema.classicRounds.updatedAt, new Date(Date.now() - STALE_MS))))
  for (const row of stale) {
    try {
      await db.transaction(async tx => {
        const [cur] = await tx.select().from(schema.classicRounds)
          .where(and(eq(schema.classicRounds.id, row.id), eq(schema.classicRounds.status, 'active'))).for('update')
        if (!cur) return   // finished meanwhile
        const timeout = statefulGame(cur.game)?.onTimeout
        if (timeout) {
          const step = timeout(cur.state)
          await tx.update(schema.classicRounds)
            .set({ state: step.state as object, status: 'done', updatedAt: new Date() }).where(eq(schema.classicRounds.id, cur.id))
          await settle(tx, cur.userId, cur.id, Number(cur.bet), step.done ?? { outcome: 'lost', mult: 0 })
          return
        }
        await tx.update(schema.classicRounds).set({ status: 'done', updatedAt: new Date() }).where(eq(schema.classicRounds.id, cur.id))
        await closeStake(cur.userId, cur.id, 'refunded', 0, tx)
        await closeStake(cur.userId, `${cur.id}:dbl`, 'refunded', 0, tx)
      })
    } catch (e) { console.error('could not refund stale round', row.id, e) }
  }
  return stale.length
}

export const startClassicsSweeper = () => {
  const run = () => sweepStaleRounds().catch(e => console.error('classics sweep failed', e))
  void run()
  setInterval(run, 60 * 60_000).unref()
}
