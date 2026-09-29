import { randomUUID, randomInt } from 'node:crypto'
// Deliberately reaches into the client package: the replay must run the
// exact same engine the client previews with, or "server-authoritative"
// means nothing. Not a dependency, just a shared-source relative import.
import { PLAYERS } from '../client/src/games/slither/engine'
import { replayRound, type RecordedInput } from '../client/src/games/slither/replay'
import { debit, credit, getBalance } from './store'

type PendingRound = { userId: string; bet: number; seed: number; createdAt: number }

const ROUND_TIMEOUT_MS = 5 * 60 * 1000   // a round must be settled within 5 minutes or it's abandoned
const pending = new Map<string, PendingRound>()

setInterval(() => {
  const cutoff = Date.now() - ROUND_TIMEOUT_MS
  for (const [id, r] of pending) if (r.createdAt < cutoff) pending.delete(id)
}, 60_000).unref()

export const startRound = async (userId: string, bet: number) => {
  if (!(bet > 0) || !Number.isFinite(bet)) throw new Error('bad bet amount')
  const roundId = randomUUID()
  const balance = await debit(userId, bet, roundId)   // throws if insufficient — round never gets created
  const seed = randomInt(0, 2 ** 31)   // server-chosen: the client never influences the seed
  pending.set(roundId, { userId, bet, seed, createdAt: Date.now() })
  return { roundId, seed, players: PLAYERS, balance }
}

const MAX_INPUTS = 60 * 65   // ~65s of ticks at 60Hz, comfortably above the 60s round length

export const finishRound = async (userId: string, roundId: string, inputs: RecordedInput[]) => {
  const round = pending.get(roundId)
  if (!round) throw new Error('unknown or already-settled round')
  if (round.userId !== userId) throw new Error('round belongs to a different user')
  pending.delete(roundId)   // one-time use: this round can never be settled twice

  if (!Array.isArray(inputs) || inputs.length > MAX_INPUTS) throw new Error('bad input log')
  const cleanInputs = inputs.slice(0, MAX_INPUTS).map(i => ({
    want: Number.isFinite(i?.want) ? i.want : 0,
    boost: !!i?.boost,
  }))

  const result = replayRound(round.seed, cleanInputs)   // the ONLY thing that decides the outcome
  const payout = round.bet * result.payoutMultiplier
  const balance = payout > 0 ? await credit(userId, payout, roundId) : await getBalance(userId)
  return { ...result, payout, bet: round.bet, balance }
}
