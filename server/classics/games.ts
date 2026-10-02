// Rules of the classic games. Every function here is pure: it gets validated parameters plus the provably fair
// random numbers and returns the outcome. Money (stakes, payouts) is handled by ./service.ts.
import {
  KENO_DRAWN, KENO_MAX_PICKS, KENO_NUMBERS, KENO_RISK, LIMBO_MIN, MAX_CRASH, MINES_TILES, PLINKO_RISK, PLINKO_ROWS, RED,
  type KenoRisk, type PlinkoRisk, type RouletteBet,
  crashPoint, diceChance, diceMult, diceRoll, diceWin, handValue, hiloChance, hiloStepMult, hiloWins, isBlackjack, kenoTable,
  minesMult, plinkoTable, round2, rouletteReturn, rouletteWins, DICE_MAX, DICE_MIN, DECKS,
} from '../../client/src/games/classics/math'
import { PublicError, parseStake } from '../security'
import { sample, type Rng } from './fair'

type Body = Record<string, unknown>
const bad = (msg = 'invalid bet'): never => { throw new PublicError(msg) }
const num = (v: unknown, msg?: string) => (typeof v === 'number' && Number.isFinite(v) ? v : bad(msg))
const int = (v: unknown, min: number, max: number, msg?: string) => {
  const n = num(v, msg)
  return Number.isInteger(n) && n >= min && n <= max ? n : bad(msg)
}
const oneOf = <T extends string | number>(v: unknown, list: readonly T[], msg?: string): T => (list.includes(v as T) ? (v as T) : bad(msg))

// ================= instant games: one request, one result =================
export type Instant = {
  parse: (body: Body) => { stake: number; params: any }
  play: (params: any, stake: number, rng: Rng) => { payout: number; details: Record<string, unknown> }
}

export const dice: Instant = {
  parse: b => {
    if (typeof b.over !== 'boolean') bad()
    const target = Math.round(num(b.target) * 100) / 100
    if (target < DICE_MIN || target > DICE_MAX) bad('target must be between 2 and 98')
    return { stake: parseStake(b.amount), params: { over: b.over, target } }
  },
  play: ({ over, target }: { over: boolean; target: number }, stake, rng) => {
    const roll = diceRoll(rng.next())
    const win = diceWin(over, target, roll)
    const mult = diceMult(diceChance(over, target))
    return { payout: win ? round2(stake * mult) : 0, details: { roll, win, mult, over, target } }
  },
}

export const limbo: Instant = {
  parse: b => {
    const target = Math.round(num(b.target) * 100) / 100
    if (target < LIMBO_MIN || target > MAX_CRASH) bad(`target must be between ${LIMBO_MIN} and ${MAX_CRASH}`)
    return { stake: parseStake(b.amount), params: { target } }
  },
  play: ({ target }: { target: number }, stake, rng) => {
    const result = crashPoint(rng.next())
    const win = result >= target
    return { payout: win ? round2(stake * target) : 0, details: { result, win, target, mult: win ? target : 0 } }
  },
}

export const plinko: Instant = {
  parse: b => ({
    stake: parseStake(b.amount),
    params: { rows: oneOf(b.rows, PLINKO_ROWS), risk: oneOf(b.risk, PLINKO_RISK) },
  }),
  play: ({ rows, risk }: { rows: number; risk: PlinkoRisk }, stake, rng) => {
    const path = Array.from({ length: rows }, () => (rng.next() < 0.5 ? 0 : 1))
    const slot = path.reduce<number>((a, b) => a + b, 0)
    const mult = plinkoTable(rows, risk)[slot]
    return { payout: round2(stake * mult), details: { path, slot, mult, rows, risk } }
  },
}

export const keno: Instant = {
  parse: b => {
    if (!Array.isArray(b.picks) || b.picks.length < 1 || b.picks.length > KENO_MAX_PICKS) bad(`pick 1-${KENO_MAX_PICKS} numbers`)
    const picks = (b.picks as unknown[]).map(p => int(p, 1, KENO_NUMBERS, `numbers go from 1 to ${KENO_NUMBERS}`))
    if (new Set(picks).size !== picks.length) bad('pick each number once')
    return { stake: parseStake(b.amount), params: { picks, risk: oneOf(b.risk, KENO_RISK) } }
  },
  play: ({ picks, risk }: { picks: number[]; risk: KenoRisk }, stake, rng) => {
    const drawn = sample(rng, KENO_NUMBERS, KENO_DRAWN).map(n => n + 1)
    const hits = picks.filter(p => drawn.includes(p))
    const mult = kenoTable(picks.length, risk)[hits.length]
    return { payout: round2(stake * mult), details: { drawn, hits, mult, picks, risk } }
  },
}

export const roulette: Instant = {
  parse: b => {
    if (!Array.isArray(b.bets) || b.bets.length < 1 || b.bets.length > 20) bad('place 1-20 bets')
    let total = 0
    const bets = (b.bets as Body[]).map(raw => {
      if (!raw || typeof raw !== 'object') bad()
      const amount = parseStake(raw.amount)
      total = round2(total + amount)
      const type = oneOf(raw.type, ['straight', 'red', 'black', 'odd', 'even', 'low', 'high', 'dozen', 'column'] as const)
      if (type === 'straight') return { type, value: int(raw.value, 0, 36), amount }
      if (type === 'dozen' || type === 'column') return { type, value: int(raw.value, 0, 2), amount }
      return { type, amount }
    })
    return { stake: parseStake(total), params: { bets } }
  },
  play: ({ bets }: { bets: (RouletteBet & { amount: number })[] }, _stake, rng) => {
    const number = Math.floor(rng.next() * 37)
    let payout = 0
    const wins: boolean[] = []
    for (const bet of bets) {
      const win = rouletteWins(bet, number)
      wins.push(win)
      if (win) payout += bet.amount * rouletteReturn(bet)
    }
    return { payout: round2(payout), details: { number, color: number === 0 ? 'green' : RED.has(number) ? 'red' : 'black', wins } }
  },
}

export const INSTANT: Record<string, Instant> = { dice, limbo, plinko, keno, roulette }

// ================= stateful games: a round that lasts several requests =================
// `done.mult` is the total return per unit of every stake in the round (0 = lost, 1 = push/refund-like handled by `outcome`).
export type Done = { outcome: 'won' | 'lost' | 'refunded'; mult: number }
export type Step<S> = { state: S; view: Record<string, unknown>; done?: Done; extraStake?: number }
export type Stateful<S = any> = {
  view: (state: S) => Record<string, unknown>   // what the browser may see of a stored round
  parse: (body: Body) => { stake: number; params: any }
  start: (params: any, stake: number, rng: Rng) => Step<S>
  // `needsStake`: an action that requires putting more money down (blackjack double) says how much first
  needsStake?: (state: S, action: string, stake: number) => number
  act: (state: S, action: string, body: Body, stake: number) => Step<S>
  // How an abandoned round ends. Absent = the stake is refunded; set when the player has already seen cards.
  onTimeout?: (state: S) => Step<S>
}

// ---------- Mines ----------
type MinesState = { mines: number[]; revealed: number[]; m: number }
const minesView = (s: MinesState, done?: Done) => {
  const k = s.revealed.length
  return {
    revealed: s.revealed, mines: s.m, mult: minesMult(s.m, k), nextMult: k < MINES_TILES - s.m ? minesMult(s.m, k + 1) : null,
    ...(done ? { bombs: s.mines } : {}),   // mine positions are only revealed once the round is over
  }
}
export const mines: Stateful<MinesState> = {
  view: s => minesView(s),
  parse: b => ({ stake: parseStake(b.amount), params: { mines: int(b.mines, 1, MINES_TILES - 1, 'mines must be 1-24') } }),
  start: ({ mines: m }: { mines: number }, _stake, rng) => {
    const state: MinesState = { mines: sample(rng, MINES_TILES, m), revealed: [], m }
    return { state, view: minesView(state) }
  },
  act: (s, action, b) => {
    if (action === 'cashout') {
      if (s.revealed.length < 1) bad('reveal a tile first')
      return { state: s, view: minesView(s, { outcome: 'won', mult: 0 }), done: { outcome: 'won', mult: minesMult(s.m, s.revealed.length) } }
    }
    if (action !== 'reveal') bad('unknown action')
    const tile = int(b.tile, 0, MINES_TILES - 1, 'bad tile')
    if (s.revealed.includes(tile)) bad('tile already revealed')
    if (s.mines.includes(tile)) {
      const next = { ...s, revealed: [...s.revealed, tile] }
      return { state: next, view: { ...minesView(s, { outcome: 'lost', mult: 0 }), hit: tile }, done: { outcome: 'lost', mult: 0 } }
    }
    const next = { ...s, revealed: [...s.revealed, tile] }
    if (next.revealed.length === MINES_TILES - s.m) {   // every safe tile found: cash out automatically
      return { state: next, view: minesView(next, { outcome: 'won', mult: 0 }), done: { outcome: 'won', mult: minesMult(s.m, next.revealed.length) } }
    }
    return { state: next, view: minesView(next) }
  },
}

// ---------- HiLo ----------
const HILO_STEPS = 200
type HiloState = { cards: number[]; idx: number; wins: number; mult: number }
const hiloView = (s: HiloState, extra: Record<string, unknown> = {}) => ({
  card: s.cards[s.idx], wins: s.wins, mult: Math.floor(s.mult * 10000) / 10000,
  higher: hiloChance(s.cards[s.idx], 'higher'), lower: hiloChance(s.cards[s.idx], 'lower'),
  higherMult: Math.floor(s.mult * hiloStepMult(s.cards[s.idx], 'higher') * 10000) / 10000,
  lowerMult: Math.floor(s.mult * hiloStepMult(s.cards[s.idx], 'lower') * 10000) / 10000,
  ...extra,
})
export const hilo: Stateful<HiloState> = {
  view: s => hiloView(s),
  parse: b => ({ stake: parseStake(b.amount), params: {} }),
  start: (_p, _stake, rng) => {
    const state: HiloState = { cards: Array.from({ length: HILO_STEPS }, () => Math.floor(rng.next() * 13) + 1), idx: 0, wins: 0, mult: 1 }
    return { state, view: hiloView(state) }
  },
  act: (s, action) => {
    if (action === 'cashout') {
      if (s.wins < 1) bad('make a guess first')
      return { state: s, view: hiloView(s), done: { outcome: 'won', mult: Math.floor(s.mult * 10000) / 10000 } }
    }
    if (action === 'skip') {
      if (s.idx >= HILO_STEPS - 2) bad('no more skips')
      const next = { ...s, idx: s.idx + 1 }
      return { state: next, view: hiloView(next, { skipped: true }) }
    }
    if (action !== 'higher' && action !== 'lower') return bad('unknown action')
    const rank = s.cards[s.idx]
    const nextRank = s.cards[s.idx + 1]
    if (!hiloWins(rank, nextRank, action)) {
      return { state: { ...s, idx: s.idx + 1 }, view: hiloView({ ...s, idx: s.idx + 1 }, { lost: true, previous: rank }), done: { outcome: 'lost', mult: 0 } }
    }
    const next = { ...s, idx: s.idx + 1, wins: s.wins + 1, mult: s.mult * hiloStepMult(rank, action) }
    if (next.idx >= HILO_STEPS - 1) return { state: next, view: hiloView(next), done: { outcome: 'won', mult: Math.floor(next.mult * 10000) / 10000 } }
    return { state: next, view: hiloView(next, { previous: rank }) }
  },
}

// ---------- Blackjack ----------
type BjState = { shoe: number[]; idx: number; player: number[]; dealer: number[]; doubled: boolean }
const bjView = (s: BjState, over: boolean, extra: Record<string, unknown> = {}) => ({
  player: s.player, playerValue: handValue(s.player).total,
  dealer: over ? s.dealer : [s.dealer[0]],
  dealerValue: over ? handValue(s.dealer).total : handValue([s.dealer[0]]).total,
  doubled: s.doubled, canDouble: !over && s.player.length === 2 && !s.doubled, ...extra,
})
const bjSettle = (s: BjState): Step<BjState> => {
  const state = { ...s, dealer: [...s.dealer], idx: s.idx }
  while (handValue(state.dealer).total < 17) state.dealer.push(state.shoe[state.idx++])   // dealer stands on every 17
  const p = handValue(state.player).total
  const d = handValue(state.dealer).total
  let done: Done
  if (p > 21) done = { outcome: 'lost', mult: 0 }
  else if (d > 21 || p > d) done = { outcome: 'won', mult: 2 }
  else if (p === d) done = { outcome: 'refunded', mult: 1 }
  else done = { outcome: 'lost', mult: 0 }
  return { state, view: bjView(state, true, { result: done.outcome }), done }
}
export const blackjack: Stateful<BjState> = {
  view: s => bjView(s, false),
  parse: b => ({ stake: parseStake(b.amount), params: {} }),
  start: (_p, _stake, rng) => {
    const shoe = sample(rng, 52 * DECKS, 52 * DECKS).map(c => c % 52)
    const state: BjState = { shoe, idx: 4, player: [shoe[0], shoe[2]], dealer: [shoe[1], shoe[3]], doubled: false }
    const pBj = isBlackjack(state.player), dBj = isBlackjack(state.dealer)
    if (pBj || dBj) {   // the dealer peeks: a natural ends the hand at once
      const done: Done = pBj && dBj ? { outcome: 'refunded', mult: 1 } : pBj ? { outcome: 'won', mult: 2.5 } : { outcome: 'lost', mult: 0 }
      return { state, view: bjView(state, true, { result: done.outcome, blackjack: pBj }), done }
    }
    return { state, view: bjView(state, false) }
  },
  needsStake: (s, action, stake) => (action === 'double' && s.player.length === 2 && !s.doubled ? stake : 0),
  onTimeout: s => bjSettle(s),   // automatic stand: an abandoned hand is played out, never refunded
  act: (s, action) => {
    if (action === 'stand') return bjSettle(s)
    if (action === 'hit') {
      if (s.doubled) bad('no more cards after doubling')
      const next = { ...s, player: [...s.player, s.shoe[s.idx]], idx: s.idx + 1 }
      const v = handValue(next.player).total
      if (v > 21) return { state: next, view: bjView(next, true, { result: 'lost', bust: true }), done: { outcome: 'lost', mult: 0 } }
      if (v === 21) return bjSettle(next)
      return { state: next, view: bjView(next, false) }
    }
    if (action === 'double') {
      if (s.player.length !== 2 || s.doubled) bad('you can only double on your first move')
      const next = { ...s, player: [...s.player, s.shoe[s.idx]], idx: s.idx + 1, doubled: true }
      if (handValue(next.player).total > 21) return { state: next, view: bjView(next, true, { result: 'lost', bust: true }), done: { outcome: 'lost', mult: 0 } }
      return bjSettle(next)
    }
    return bad('unknown action')
  },
}

export const STATEFUL: Record<string, Stateful> = { mines, hilo, blackjack }

export const instantGame = (key: string): Instant | undefined => (Object.hasOwn(INSTANT, key) ? INSTANT[key] : undefined)
export const statefulGame = (key: string): Stateful | undefined => (Object.hasOwn(STATEFUL, key) ? STATEFUL[key] : undefined)
