import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Home, Radio, Star, Search, Trophy, Volleyball, Swords, Target, Crosshair, Snowflake, CircleDot,
  Dumbbell, Ticket, ChevronUp, ChevronDown, X, Flame, Clock, TrendingUp,
} from 'lucide-react'
import { SPORTS, formatMatchTime, type SportKey } from '../data/sports'
import { getOdds, placeBet, type OddsEvent, SportsApiError } from '../lib/sportsApi'
import { getWallet } from '../lib/walletApi'
import { useAuth } from '../lib/auth/context'

const SPORT_ICONS: Record<SportKey, typeof Trophy> = {
  'soccer': Trophy,
  'basketball': Volleyball,
  'american-football': Swords,
  'tennis': Target,
  'counter-strike': Crosshair,
  'ice-hockey': Snowflake,
  'baseball': CircleDot,
  'boxing': Dumbbell,
  'table-tennis': Target,
}

const FILTERS = [
  { key: 'popular',  label: 'Popular',  icon: Flame },
  { key: 'live',     label: 'Live',     icon: Radio },
  { key: 'upcoming', label: 'Upcoming', icon: Clock },
  { key: 'predictions', label: 'Predictions', icon: TrendingUp },
]

// A pick names the exact outcome the server will price/settle against
// (event.outcomes[].name — the team name, or 'Draw'), never just a
// display label; label is only for the button ('1' / 'draw' / '2').
type Pick = { eventId: string; sportKey: string; label: string; selection: string; value: number; teams: string }

const labelFor = (event: OddsEvent, outcomeName: string) =>
  outcomeName === event.homeTeam ? '1' : outcomeName === event.awayTeam ? '2' : 'draw'

const Odds = ({
  event, picks, onPick,
}: { event: OddsEvent; picks: Pick[]; onPick: (e: OddsEvent, outcomeName: string, price: number) => void }) => (
  <div className="sp-odds">
    {event.outcomes.map(o => {
      const on = picks.some(p => p.eventId === event.id && p.selection === o.name)
      return (
        <button
          key={o.name}
          className={`sp-odd${on ? ' sp-odd--on' : ''}`}
          onClick={() => onPick(event, o.name, o.price)}
        >
          <span>{labelFor(event, o.name)}</span>
          <b>{o.price.toFixed(2)}</b>
        </button>
      )
    })}
  </div>
)

const Sports = () => {
  const [params, setParams] = useSearchParams()
  const sport = (params.get('sport') ?? 'soccer') as SportKey
  const [filter, setFilter] = useState('popular')
  const [picks, setPicks] = useState<Pick[]>([])
  const [slipOpen, setSlipOpen] = useState(false)
  const [stake, setStake] = useState('10')
  const [slipError, setSlipError] = useState('')
  const [placing, setPlacing] = useState(false)

  // Keyed by the sport/user the result is *for*, so switching sport or user
  // never needs a synchronous "reset to loading/null" setState in the
  // effect itself — loading/balance are just derived from whether the
  // latest result still matches the current sport/user.
  const [oddsResult, setOddsResult] = useState<{ sport: SportKey; events: OddsEvent[]; error: string } | null>(null)
  const [walletResult, setWalletResult] = useState<{ userId: string; balance: number } | null>(null)
  const { user, openAuth } = useAuth()

  const setSport = (s: SportKey) => setParams({ sport: s })

  useEffect(() => {
    let cancelled = false
    getOdds(sport)
      .then(list => { if (!cancelled) setOddsResult({ sport, events: list, error: '' }) })
      .catch(e => {
        if (cancelled) return
        setOddsResult({
          sport, events: [],
          error: e instanceof SportsApiError && e.message === 'unknown sport'
            ? "Odds for this sport aren't hooked up yet."
            : 'Could not load odds. Try again shortly.',
        })
      })
    return () => { cancelled = true }
  }, [sport])

  const loading = oddsResult?.sport !== sport
  const events = oddsResult?.sport === sport ? oddsResult.events : []
  const loadError = oddsResult?.sport === sport ? oddsResult.error : ''

  useEffect(() => {
    if (!user) return
    let cancelled = false
    getWallet().then(r => { if (!cancelled) setWalletResult({ userId: user.id, balance: r.balance }) }).catch(() => {})
    return () => { cancelled = true }
  }, [user])

  const balance = user && walletResult?.userId === user.id ? walletResult.balance : null

  const onPick = (event: OddsEvent, outcomeName: string, price: number) =>
    setPicks(prev => {
      const same = prev.find(p => p.eventId === event.id && p.selection === outcomeName)
      const rest = prev.filter(p => p.eventId !== event.id)
      if (same) return rest
      return [...rest, {
        eventId: event.id, sportKey: sport, selection: outcomeName,
        label: labelFor(event, outcomeName), value: price, teams: `${event.homeTeam} vs ${event.awayTeam}`,
      }]
    })

  const sorted = [...events].sort((a, b) => new Date(a.commenceTime).getTime() - new Date(b.commenceTime).getTime())
  const featured = sorted.slice(0, 3)
  const list = filter === 'live' ? [] : sorted   // no live in-play feed on the free tier — be honest about it
  const stakeNum = parseFloat(stake) || 0
  const potentialWin = picks.reduce((sum, p) => sum + stakeNum * p.value, 0)

  const placeBets = async () => {
    if (!user) { openAuth('login'); return }
    if (!(stakeNum > 0)) return setSlipError('Enter a stake amount')
    setSlipError('')
    setPlacing(true)
    try {
      let lastBalance: number | null = null
      for (const p of picks) {
        const r = await placeBet(p.sportKey, p.eventId, p.selection, stakeNum)
        lastBalance = r.balance
      }
      if (lastBalance !== null) setWalletResult({ userId: user.id, balance: lastBalance })
      setPicks([])
    } catch (e) {
      setSlipError(e instanceof SportsApiError ? e.message : 'Could not place bet')
      getWallet().then(r => setWalletResult({ userId: user.id, balance: r.balance })).catch(() => {})
    } finally {
      setPlacing(false)
    }
  }

  return (
    <div className="sp-page">
      <div className="sp-strip">
        <button className="sp-strip-btn" title="Home"><Home size={20} strokeWidth={1.5} /></button>
        <button className="sp-strip-btn" title="Live"><Radio size={20} strokeWidth={1.5} /></button>
        <button className="sp-strip-btn" title="Favourites"><Star size={20} strokeWidth={1.5} /></button>
        <span className="sp-strip-sep" />
        {SPORTS.map(({ key, label }) => {
          const Icon = SPORT_ICONS[key]
          return (
            <button
              key={key}
              className={`sp-strip-btn${sport === key ? ' sp-strip-btn--on' : ''}`}
              title={label}
              onClick={() => setSport(key)}
            >
              <Icon size={20} strokeWidth={1.5} />
            </button>
          )
        })}
        <button className="sp-strip-btn sp-strip-search" title="Search"><Search size={20} strokeWidth={1.5} /></button>
      </div>

      <div className="sp-body">
        <div className="sp-filters">
          {FILTERS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={`sp-filter${filter === key ? ' sp-filter--on' : ''}`}
              onClick={() => setFilter(key)}
            >
              <Icon size={15} strokeWidth={1.75} /> {label}
            </button>
          ))}
        </div>

        {loading && <p className="cg-empty">Loading odds…</p>}
        {!loading && loadError && <p className="cg-empty">{loadError}</p>}

        {!loading && !loadError && (
          <>
            <div className="sp-featured">
              {featured.map(e => (
                <div key={e.id} className="sp-feat">
                  <div className="sp-feat-top">
                    <span>{sport}</span>
                    <span>{formatMatchTime(e.commenceTime)}</span>
                  </div>
                  <div className="sp-feat-teams">
                    <b>{e.homeTeam}</b>
                    <b>{e.awayTeam}</b>
                  </div>
                  <p className="sp-feat-market">Moneyline</p>
                  <Odds event={e} picks={picks} onPick={onPick} />
                </div>
              ))}
            </div>

            <div className="sp-pills">
              {SPORTS.map(({ key, label }) => {
                const Icon = SPORT_ICONS[key]
                return (
                  <button
                    key={key}
                    className={`sp-pill${sport === key ? ' sp-pill--on' : ''}`}
                    onClick={() => setSport(key)}
                  >
                    <Icon size={15} strokeWidth={1.75} /> {label}
                  </button>
                )
              })}
            </div>

            <div className="sp-matches">
              {list.length === 0 && <p className="cg-empty">No events right now.</p>}
              {list.map(e => (
                <div key={e.id} className="sp-match">
                  <p className="sp-match-league">{sport}</p>
                  <p className="sp-match-time">{formatMatchTime(e.commenceTime)}</p>
                  <p className="sp-team">{e.homeTeam}</p>
                  <p className="sp-team">{e.awayTeam}</p>
                  <p className="sp-match-market">Moneyline</p>
                  <Odds event={e} picks={picks} onPick={onPick} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className={`sp-slip${slipOpen ? ' sp-slip--open' : ''}`}>
        <button className="sp-slip-head" onClick={() => setSlipOpen(o => !o)}>
          <Ticket size={20} strokeWidth={1.75} />
          <span>Betslip</span>
          {picks.length > 0 && <em>{picks.length}</em>}
          {balance !== null && <span className="dc-balance"><span>Balance</span><b>{balance.toFixed(2)}</b></span>}
          {slipOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
        {slipOpen && (
          <div className="sp-slip-body">
            {picks.length === 0 ? (
              <p className="sp-slip-empty">Click any odds to add a selection.</p>
            ) : (
              <>
                {picks.map(p => (
                  <div key={p.eventId} className="sp-slip-pick">
                    <div>
                      <b>{p.teams}</b>
                      <span>Pick {p.label}</span>
                    </div>
                    <strong>{p.value.toFixed(2)}</strong>
                    <button onClick={() => setPicks(prev => prev.filter(x => x.eventId !== p.eventId))} aria-label="Remove">
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <label className="sp-slip-stake">
                  Stake (per pick)
                  <input value={stake} onChange={e => setStake(e.target.value)} inputMode="decimal" />
                </label>
                <div className="sp-slip-total">
                  <span>Potential win</span>
                  <b>{potentialWin.toFixed(2)}</b>
                </div>
                {slipError && <p className="dc-error">{slipError}</p>}
                <button className="sp-slip-place" onClick={placeBets} disabled={placing}>
                  {placing ? 'Placing…' : user ? 'Place Bet' : 'Log in to place bet'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default Sports
