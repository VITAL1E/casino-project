// Records what a player did (called from the same transaction that settles the money) and moves their stats and
// daily challenge progress forward. Nothing here pays anything: claiming is a separate, explicit step (./service.ts).
import { sql } from 'drizzle-orm'
import { db, schema } from '../db'
import { CHALLENGES, periodOf, type Challenge } from './defs'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Delta = { wagered?: number; plays?: number; wins?: number; mult?: number }

const applies = (c: Challenge, game: string) => !c.games || c.games.includes(game)
const round2 = (n: number) => Math.round(n * 100) / 100

const bumpChallenges = async (tx: Tx, userId: string, game: string, d: Delta) => {
  const period = periodOf()
  for (const c of CHALLENGES) {
    if (!applies(c, game)) continue
    const add = c.metric === 'wagered' ? d.wagered : c.metric === 'plays' ? d.plays : c.metric === 'wins' ? d.wins : undefined
    const progress = schema.challengeProgress.progress
    if (c.metric === 'multiplier') {
      if (d.mult === undefined) continue
      const value = Math.min(c.target, d.mult)
      await tx.insert(schema.challengeProgress).values({ userId, challengeId: c.id, period, progress: String(value) })
        .onConflictDoUpdate({ target: [schema.challengeProgress.userId, schema.challengeProgress.challengeId, schema.challengeProgress.period], set: { progress: sql`greatest(${progress}, ${value})` } })
    } else if (add) {
      await tx.insert(schema.challengeProgress).values({ userId, challengeId: c.id, period, progress: String(Math.min(c.target, add)) })
        .onConflictDoUpdate({ target: [schema.challengeProgress.userId, schema.challengeProgress.challengeId, schema.challengeProgress.period], set: { progress: sql`least(${c.target}, ${progress} + ${add})` } })
    }
  }
}

const bumpStats = (tx: Tx, userId: string, d: { wagered?: number; bets?: number; wins?: number; win?: number }) =>
  tx.insert(schema.playerStats).values({
    userId, wagered: String(d.wagered ?? 0), bets: d.bets ?? 0, wins: d.wins ?? 0, biggestWin: String(d.win ?? 0),
  }).onConflictDoUpdate({
    target: schema.playerStats.userId,
    set: {
      wagered: sql`${schema.playerStats.wagered} + ${d.wagered ?? 0}`,
      bets: sql`${schema.playerStats.bets} + ${d.bets ?? 0}`,
      wins: sql`${schema.playerStats.wins} + ${d.wins ?? 0}`,
      biggestWin: sql`greatest(${schema.playerStats.biggestWin}, ${d.win ?? 0})`,
    },
  })

// A bet was placed (sports bets are tracked when placed, everything else when the stake closes).
export const recordPlaced = async (tx: Tx, userId: string, game: string, stake: number) => {
  await bumpStats(tx, userId, { wagered: stake, bets: 1 })
  await bumpChallenges(tx, userId, game, { wagered: stake, plays: 1 })
}

// A bet was decided. `payout` is what came back (0 for a loss); a win is a payout above the stake.
export const recordResult = async (tx: Tx, userId: string, game: string, stake: number, payout: number) => {
  const won = payout > stake
  if (!won) return
  await bumpStats(tx, userId, { wins: 1, win: round2(payout) })
  await bumpChallenges(tx, userId, game, { wins: 1, mult: stake > 0 ? round2(payout / stake) : 0 })
}
