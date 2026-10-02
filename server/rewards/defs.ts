// What players can earn. Everything here is play credit paid through the wallet (reason "reward"), never anything
// that bypasses it. The browser only ever displays these definitions; progress and payouts are server-side.

export const ARCADE = ['slither', 'agar', 'hole', 'paper', 'chicken', 'storm', 'roadcross', 'flappy'] as const
export const CLASSICS = ['dice', 'mines', 'plinko', 'crash', 'keno', 'limbo', 'hilo', 'blackjack', 'roulette'] as const

// ---------- VIP: derived from lifetime amount wagered ----------
export type Tier = { key: string; name: string; min: number; reward: number }
export const TIERS: Tier[] = [
  { key: 'bronze', name: 'Bronze', min: 0, reward: 0 },
  { key: 'silver', name: 'Silver', min: 1_000, reward: 25 },
  { key: 'gold', name: 'Gold', min: 10_000, reward: 100 },
  { key: 'platinum', name: 'Platinum', min: 50_000, reward: 500 },
  { key: 'diamond', name: 'Diamond', min: 250_000, reward: 2_500 },
]
export const tierFor = (wagered: number) => [...TIERS].reverse().find(t => wagered >= t.min) ?? TIERS[0]

// ---------- Daily challenges ----------
export type Metric = 'wagered' | 'plays' | 'wins' | 'multiplier'
export type Challenge = {
  id: string
  title: string
  metric: Metric
  target: number
  reward: number
  games?: readonly string[]   // only these games count (omit = any game)
}

export const CHALLENGES: Challenge[] = [
  { id: 'wager-100', title: 'Wager 100 credits on any game', metric: 'wagered', target: 100, reward: 10 },
  { id: 'win-3', title: 'Win 3 bets', metric: 'wins', target: 3, reward: 15 },
  { id: 'arcade-match', title: 'Finish a match in any arcade game', metric: 'plays', target: 1, reward: 10, games: ARCADE },
  { id: 'arcade-win', title: 'Win an arcade game', metric: 'wins', target: 1, reward: 25, games: ARCADE },
  { id: 'classic-5x', title: 'Win a classic game at 5x or more', metric: 'multiplier', target: 5, reward: 25, games: CLASSICS },
  { id: 'sports-bet', title: 'Place a sports bet', metric: 'plays', target: 1, reward: 10, games: ['sports'] },
]

// UTC calendar day, e.g. "2026-10-01": challenges reset when it changes.
export const periodOf = (d = new Date()) => d.toISOString().slice(0, 10)
export const nextReset = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString()

// stake.game values look like "classic:dice" / "classic-round:mines" / "agar": reduce them to the plain game key
export const gameKey = (stakeGame: string) => stakeGame.replace(/^classic(-round)?:/, '')
