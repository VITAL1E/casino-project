// Placing a bet never trusts the odds the client sends — it re-reads the
// server's own cached line for that event and prices the bet off that, the
// same "server is authoritative" rule the Slither replay uses for payouts.
import { eq, and, desc } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { debit, credit } from '../wallet'
import { recordPlaced, recordResult } from '../rewards/progress'
import { PublicError, parseStake } from '../security'
import { findEvent, type OddsEvent } from './oddsApi'
import { db, schema } from '../db'

export type SportsBet = {
  id: string
  eventId: string
  sportKey: string
  commenceTime: string
  homeTeam: string
  awayTeam: string
  selection: string
  odds: number
  stake: number
  potentialPayout: number
  status: 'pending' | 'won' | 'lost' | 'void'
  createdAt: string
  settledAt: string | null
}

const priceFor = (event: OddsEvent, selection: string): number | null =>
  event.outcomes.find(o => o.name === selection)?.price ?? null

export const placeBet = async (
  userId: string,
  sportKey: string,
  eventId: string,
  selection: string,
  rawStake: unknown,
): Promise<{ bet: SportsBet; balance: number }> => {
  const stake = parseStake(rawStake)

  const event = await findEvent(sportKey, eventId)
  if (!event) throw new PublicError('event not found or odds expired — refresh and try again')
  const odds = priceFor(event, selection)
  if (odds === null) throw new PublicError('unknown selection for this event')
  if (new Date(event.commenceTime).getTime() <= Date.now()) throw new PublicError('this event has already started')

  const potentialPayout = Math.round(stake * odds * 100) / 100
  const betId = randomUUID()   // the idempotency ref for both the stake and the payout
  // Debit, rewards update and bet row commit together: any failure rolls the stake back.
  const { balance, row } = await db.transaction(async tx => {
    const balance = await debit(userId, stake, betId, tx)
    await recordPlaced(tx, userId, 'sports', stake)
    const [row] = await tx.insert(schema.sportsBets).values({
      id: betId, userId, eventId, sportKey, commenceTime: new Date(event.commenceTime),
      homeTeam: event.homeTeam, awayTeam: event.awayTeam, selection,
      odds: String(odds), stake: String(stake), potentialPayout: String(potentialPayout),
    }).returning({ id: schema.sportsBets.id, createdAt: schema.sportsBets.createdAt })
    return { balance, row }
  })

  return {
    balance,
    bet: {
      id: row.id,
      eventId,
      sportKey,
      commenceTime: event.commenceTime,
      homeTeam: event.homeTeam,
      awayTeam: event.awayTeam,
      selection,
      odds,
      stake,
      potentialPayout,
      status: 'pending',
      createdAt: row.createdAt.toISOString(),
      settledAt: null,
    },
  }
}

export const listBets = async (userId: string): Promise<SportsBet[]> => {
  const rows = await db.select().from(schema.sportsBets)
    .where(eq(schema.sportsBets.userId, userId))
    .orderBy(desc(schema.sportsBets.createdAt))
    .limit(100)

  return rows.map(r => ({
    id: r.id,
    eventId: r.eventId,
    sportKey: r.sportKey,
    commenceTime: r.commenceTime.toISOString(),
    homeTeam: r.homeTeam,
    awayTeam: r.awayTeam,
    selection: r.selection,
    odds: Number(r.odds),
    stake: Number(r.stake),
    potentialPayout: Number(r.potentialPayout),
    status: r.status as SportsBet['status'],
    createdAt: r.createdAt.toISOString(),
    settledAt: r.settledAt?.toISOString() ?? null,
  }))
}

// Used by the settlement loop — never by a route handler directly (no user
// input reaches this, it only acts on our own DB rows + upstream scores).
// Marking the bet settled and crediting the payout happen in one
// transaction so a crash mid-settlement can never leave a bet "won" with
// no payout, or vice versa.
export const settleBet = async (betId: string, userId: string, potentialPayout: number, won: boolean) => {
  await db.transaction(async tx => {
    // The status = 'pending' guard (not just id) is what makes this
    // atomic/idempotent — a bet already settled by an earlier tick won't
    // match, so it can never be paid out twice.
    const [updated] = await tx.update(schema.sportsBets)
      .set({ status: won ? 'won' : 'lost', settledAt: new Date() })
      .where(and(eq(schema.sportsBets.id, betId), eq(schema.sportsBets.status, 'pending')))
      .returning({ id: schema.sportsBets.id, stake: schema.sportsBets.stake })
    if (!updated) return

    if (won) {   // same transaction: marked won and paid, or neither
      await credit(userId, potentialPayout, betId, tx)
      await recordResult(tx, userId, 'sports', Number(updated.stake), potentialPayout)
    }
  })
}
