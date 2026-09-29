// Thin client for The Odds API (https://the-odds-api.com), proxied through
// our own server. Never call this from the browser: it needs an API key,
// and the free tier is 500 requests/month — cached aggressively here so a
// page of visitors doesn't burn the whole month's quota in an afternoon.
const API_BASE = process.env.ODDS_API_BASE ?? 'https://api.the-odds-api.com/v4'
const API_KEY = process.env.ODDS_API_KEY

// The tabs our UI shows map to one real league each — the free tier
// doesn't reliably cover every sport (esports, table tennis) year-round,
// so those simply render an empty "no events" state rather than fake data.
export const SPORT_KEYS: Record<string, string> = {
  soccer: 'soccer_epl',
  basketball: 'basketball_nba',
  'american-football': 'americanfootball_nfl',
  'ice-hockey': 'icehockey_nhl',
  baseball: 'baseball_mlb',
}

export type OddsOutcome = { name: string; price: number }
export type OddsEvent = {
  id: string
  sportKey: string
  commenceTime: string
  homeTeam: string
  awayTeam: string
  outcomes: OddsOutcome[]
}
export type ScoreEvent = {
  id: string
  completed: boolean
  scores: { name: string; score: string }[] | null
}

type CacheEntry<T> = { data: T; expiresAt: number }
const cache = new Map<string, CacheEntry<unknown>>()

const ODDS_TTL_MS = Number(process.env.ODDS_CACHE_TTL_MS) || 3 * 60_000
const SCORES_TTL_MS = Number(process.env.SCORES_CACHE_TTL_MS) || 3 * 60_000

const cached = async <T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> => {
  const hit = cache.get(key) as CacheEntry<T> | undefined
  if (hit && hit.expiresAt > Date.now()) return hit.data
  const data = await load()
  cache.set(key, { data, expiresAt: Date.now() + ttlMs })
  return data
}

const isConfigured = () => Boolean(API_KEY)

export const getOdds = (sportKey: string): Promise<OddsEvent[]> =>
  cached(`odds:${sportKey}`, ODDS_TTL_MS, async () => {
    if (!isConfigured()) throw new Error('sports odds are not configured (ODDS_API_KEY missing)')
    const params = new URLSearchParams({ apiKey: API_KEY!, regions: 'us,uk,eu', markets: 'h2h', oddsFormat: 'decimal' })
    const res = await fetch(`${API_BASE}/sports/${sportKey}/odds?${params}`)
    if (!res.ok) throw new Error(`odds API error (${res.status})`)
    const raw = await res.json() as Array<{
      id: string; commence_time: string; home_team: string; away_team: string
      bookmakers: Array<{ markets: Array<{ key: string; outcomes: OddsOutcome[] }> }>
    }>
    // Take the first bookmaker's h2h line as our reference price — we're
    // the book here, not aggregating quotes across exchanges.
    return raw
      .map((event): OddsEvent | null => {
        const market = event.bookmakers[0]?.markets.find(m => m.key === 'h2h')
        if (!market) return null
        return {
          id: event.id,
          sportKey,
          commenceTime: event.commence_time,
          homeTeam: event.home_team,
          awayTeam: event.away_team,
          outcomes: market.outcomes,
        }
      })
      .filter((e): e is OddsEvent => e !== null)
  })

export const findEvent = async (sportKey: string, eventId: string): Promise<OddsEvent | null> => {
  const events = await getOdds(sportKey)
  return events.find(e => e.id === eventId) ?? null
}

export const getScores = (sportKey: string): Promise<ScoreEvent[]> =>
  cached(`scores:${sportKey}`, SCORES_TTL_MS, async () => {
    if (!isConfigured()) throw new Error('sports odds are not configured (ODDS_API_KEY missing)')
    const params = new URLSearchParams({ apiKey: API_KEY!, daysFrom: '3' })
    const res = await fetch(`${API_BASE}/sports/${sportKey}/scores?${params}`)
    if (!res.ok) throw new Error(`odds API error (${res.status})`)
    const raw = await res.json() as Array<{ id: string; completed: boolean; scores: { name: string; score: string }[] | null }>
    return raw.map(e => ({ id: e.id, completed: e.completed, scores: e.scores }))
  })
