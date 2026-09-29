// Background loop: every SPORTS_SETTLEMENT_INTERVAL_MS, look at whatever
// sports currently have a pending bet, ask the odds API for scores on
// just those, and settle anything that's finished. Bounded by what's
// actually pending, so it doesn't poll sports nobody bet on.
import { randomUUID } from 'node:crypto'
import { eq, and } from 'drizzle-orm'
import { db, schema } from '../db'
import { getScores } from './oddsApi'
import { settleBet } from './bets'
import { broadcastWin } from '../liveWins'

const INTERVAL_MS = Number(process.env.SPORTS_SETTLEMENT_INTERVAL_MS) || 3 * 60_000

const settlePendingForSport = async (sportKey: string) => {
  const pending = await db.select({
    id: schema.sportsBets.id,
    userId: schema.sportsBets.userId,
    username: schema.users.username,
    eventId: schema.sportsBets.eventId,
    homeTeam: schema.sportsBets.homeTeam,
    awayTeam: schema.sportsBets.awayTeam,
    selection: schema.sportsBets.selection,
    potentialPayout: schema.sportsBets.potentialPayout,
  })
    .from(schema.sportsBets)
    .innerJoin(schema.users, eq(schema.users.id, schema.sportsBets.userId))
    .where(and(eq(schema.sportsBets.sportKey, sportKey), eq(schema.sportsBets.status, 'pending')))
  if (!pending.length) return

  const scores = await getScores(sportKey)
  const byEvent = new Map(scores.map(s => [s.id, s]))

  for (const bet of pending) {
    const score = byEvent.get(bet.eventId)
    if (!score || !score.completed || !score.scores) continue

    const home = score.scores.find(s => s.name === bet.homeTeam)
    const away = score.scores.find(s => s.name === bet.awayTeam)
    if (!home || !away) continue

    const homeScore = Number(home.score)
    const awayScore = Number(away.score)
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) continue

    const winner = homeScore === awayScore ? 'Draw' : homeScore > awayScore ? bet.homeTeam : bet.awayTeam
    const won = bet.selection === winner

    try {
      await settleBet(bet.id, bet.userId, Number(bet.potentialPayout), won)
      if (won) {
        broadcastWin({
          id: randomUUID(), gameId: null, label: `${bet.homeTeam} vs ${bet.awayTeam}`,
          username: bet.username, amount: Number(bet.potentialPayout), at: new Date().toISOString(),
        })
      }
    } catch (e) {
      console.error(`failed to settle sports bet ${bet.id}:`, e)
    }
  }
}

export const startSettlementLoop = () => {
  const tick = async () => {
    try {
      const rows = await db.selectDistinct({ sportKey: schema.sportsBets.sportKey })
        .from(schema.sportsBets).where(eq(schema.sportsBets.status, 'pending'))
      for (const { sportKey } of rows) await settlePendingForSport(sportKey)
    } catch (e) {
      console.error('sports settlement tick failed:', e)
    }
  }
  tick()
  return setInterval(tick, INTERVAL_MS).unref()
}
