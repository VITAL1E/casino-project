// Rules and payout maths for the classic casino games. Pure functions, shared by the server (which decides every
// outcome in server/classics/) and the browser (which only uses them to preview multipliers and tables).
// House edge is 1% everywhere except Roulette, which keeps the classic single-zero edge of 2.7%.

export const EDGE = 0.01
export const RTP = 1 - EDGE

export const round2 = (n: number) => Math.round(n * 100) / 100
const floor = (n: number, d: number) => Math.floor(n * 10 ** d) / 10 ** d

// ---------- Dice ----------
export const DICE_MIN = 2
export const DICE_MAX = 98
export const diceRoll = (f: number) => Math.floor(f * 10001) / 100                    // 0.00 .. 100.00
export const diceChance = (over: boolean, target: number) => (over ? 100 - target : target)
export const diceMult = (chance: number) => floor((100 * RTP) / chance, 4)
export const diceWin = (over: boolean, target: number, roll: number) => (over ? roll > target : roll < target)

// ---------- Limbo / Crash ----------
export const MAX_CRASH = 1_000_000
// The multiplier a "rocket" reaches before it crashes: P(point >= m) = 0.99 / m.
export const crashPoint = (f: number) => Math.min(MAX_CRASH, Math.max(1, Math.floor((100 * RTP) / (1 - f)) / 100))
export const LIMBO_MIN = 1.01
export const CRASH_RATE = 0.12                                                         // growth per second: m(t) = e^(RATE * t)
export const crashMultAt = (t: number) => floor(Math.exp(CRASH_RATE * t), 2)
export const crashTimeOf = (point: number) => Math.log(point) / CRASH_RATE

// ---------- Mines ----------
export const MINES_TILES = 25
// Multiplier after `k` safe tiles with `m` mines on a 25 tile board: 0.99 * C(25, k) / C(25 - m, k).
export const minesMult = (m: number, k: number) => {
  if (k <= 0) return 1
  let v = RTP
  for (let i = 0; i < k; i++) v *= (MINES_TILES - i) / (MINES_TILES - m - i)
  return floor(v, 4)
}

// ---------- Plinko ----------
export const PLINKO_ROWS = [8, 10, 12, 14, 16] as const
export const PLINKO_RISK = ['low', 'medium', 'high'] as const
export type PlinkoRisk = (typeof PLINKO_RISK)[number]

const binom = (n: number, k: number) => {
  let r = 1
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i
  return r
}

// Payout per landing slot (rows + 1 slots), scaled so the expected return is 99%.
export const plinkoTable = (rows: number, risk: PlinkoRisk): number[] => {
  const base = { low: 0.4, medium: 0.2, high: 0.12 }[risk]
  const k = { low: 6, medium: 60, high: 400 }[risk]
  const q = { low: 4, medium: 5, high: 7 }[risk]
  const raw = Array.from({ length: rows + 1 }, (_, i) => base + k * (Math.abs(i - rows / 2) / (rows / 2)) ** q)
  const p = raw.map((_, i) => binom(rows, i) / 2 ** rows)
  const scale = RTP / raw.reduce((sum, r, i) => sum + r * p[i], 0)
  return raw.map(r => floor(r * scale, 2))   // rounded down: rounding must never push the return above 99%
}
export const plinkoRtp = (rows: number, risk: PlinkoRisk) =>
  plinkoTable(rows, risk).reduce((sum, m, i) => sum + (m * binom(rows, i)) / 2 ** rows, 0)

// ---------- Keno ----------
export const KENO_NUMBERS = 40
export const KENO_DRAWN = 10
export const KENO_MAX_PICKS = 10
export const KENO_RISK = ['low', 'medium', 'high'] as const
export type KenoRisk = (typeof KENO_RISK)[number]

const kenoProb = (picks: number, hits: number) =>
  (binom(picks, hits) * binom(KENO_NUMBERS - picks, KENO_DRAWN - hits)) / binom(KENO_NUMBERS, KENO_DRAWN)

// Payout for each possible number of hits (index = hits), scaled so the expected return is 99%.
export const kenoTable = (picks: number, risk: KenoRisk): number[] => {
  const alpha = { low: 0.6, medium: 0.85, high: 1.1 }[risk]
  const minHits = Math.max(1, Math.ceil(picks / 2) - (risk === 'low' ? 1 : 0))
  const weights = Array.from({ length: picks + 1 }, (_, h) => (h >= minHits ? (1 / kenoProb(picks, h)) ** alpha : 0))
  const scale = RTP / weights.reduce((sum, w, h) => sum + w * kenoProb(picks, h), 0)
  return weights.map(w => floor(w * scale, 2))
}
export const kenoRtp = (picks: number, risk: KenoRisk) =>
  kenoTable(picks, risk).reduce((sum, m, h) => sum + m * kenoProb(picks, h), 0)

// ---------- HiLo ----------
export const HILO_RANKS = 13
// Higher-or-same / lower-or-same: ties win, so both guesses always have a chance.
export const hiloChance = (rank: number, guess: 'higher' | 'lower') => (guess === 'higher' ? HILO_RANKS - rank + 1 : rank) / HILO_RANKS
export const hiloStepMult = (rank: number, guess: 'higher' | 'lower') => RTP / hiloChance(rank, guess)
export const hiloWins = (rank: number, next: number, guess: 'higher' | 'lower') => (guess === 'higher' ? next >= rank : next <= rank)

// ---------- Roulette (single zero) ----------
export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])
export type RouletteBet =
  | { type: 'straight'; value: number }   // 0..36            pays 35:1
  | { type: 'red' | 'black' | 'odd' | 'even' | 'low' | 'high' }   // pays 1:1
  | { type: 'dozen' | 'column'; value: number }                    // 0..2             pays 2:1

export const rouletteWins = (bet: RouletteBet, n: number): boolean => {
  switch (bet.type) {
    case 'straight': return n === bet.value
    case 'red': return RED.has(n)
    case 'black': return n !== 0 && !RED.has(n)
    case 'odd': return n !== 0 && n % 2 === 1
    case 'even': return n !== 0 && n % 2 === 0
    case 'low': return n >= 1 && n <= 18
    case 'high': return n >= 19 && n <= 36
    case 'dozen': return n >= 1 && Math.floor((n - 1) / 12) === bet.value
    case 'column': return n >= 1 && (n - 1) % 3 === bet.value
  }
}
// total returned per unit staked when the bet wins (stake included)
export const rouletteReturn = (bet: RouletteBet) =>
  bet.type === 'straight' ? 36 : bet.type === 'dozen' || bet.type === 'column' ? 3 : 2

// ---------- Blackjack ----------
export const DECKS = 6
// card index 0..51: rank = c % 13 (0 = Ace .. 12 = King)
export const cardRank = (c: number) => c % 13
export const cardValue = (c: number) => Math.min(10, (c % 13) + 1)   // Ace counted as 1 here, see handValue

export const handValue = (cards: number[]) => {
  let total = 0
  let aces = 0
  for (const c of cards) { total += cardValue(c); if (cardRank(c) === 0) aces++ }
  const soft = aces > 0 && total + 10 <= 21
  return { total: soft ? total + 10 : total, soft }
}
export const isBlackjack = (cards: number[]) => cards.length === 2 && handValue(cards).total === 21
