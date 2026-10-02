import { useState } from 'react'
import Seo from '../components/Seo'
import { seoFor } from '../lib/seoFor'
import { useSearchParams } from 'react-router-dom'
import { Search, Trophy, Gift, LayoutGrid } from 'lucide-react'
import { GAMES, GROUPS, type GameGroup } from '../data/casino'
import { GameTile, GameRow, TAB_ICONS } from '../components/GameRow'

const PROMOS = [
  { tag: 'Promo',    title: '$25K Weekly Race', text: 'Wager all week. Climb the leaderboard. Claim your prize.', cta: 'View Race', icon: Trophy, hue: 45 },
  { tag: 'New',      title: 'Gift Cards', text: 'Buy crypto using your preferred payment method.', cta: 'Read More', icon: Gift, hue: 160 },
]


const Casino = () => {
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const raw = params.get('group')
  const group: GameGroup | 'lobby' = GROUPS.find(g => g.key === raw)?.key ?? 'lobby'

  const setGroup = (g: string) => setParams(g === 'lobby' ? {} : { group: g })
  const q = query.trim().toLowerCase()
  const results = q ? GAMES.filter(g => g.title.toLowerCase().includes(q) || g.provider.toLowerCase().includes(q)) : null

  return (
    <div className="cg-page">
      <Seo {...seoFor('/casino')} />
      <h1 className="sr-only">Casino games</h1>
      <div className="cg-promos">
        {PROMOS.map(({ tag, title, text, cta, icon: Icon, hue }) => (
          <div key={title} className="cg-promo">
            <div className="cg-promo-body">
              <span className="cg-promo-tag">{tag}</span>
              <h2>{title}</h2>
              <p>{text}</p>
              <button className="cg-promo-btn" >{cta}</button>
            </div>
            <div
              className="cg-promo-art"
              style={{ background: `linear-gradient(150deg, hsl(${hue} 85% 55%), hsl(${hue + 50} 80% 28%))` }}
            >
              <Icon size={44} strokeWidth={1.5} />
            </div>
          </div>
        ))}
      </div>

      <label className="cg-search">
        <Search size={16} strokeWidth={1.75} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search games or providers..."
        />
      </label>

      <div className="cg-tabs">
        <button
          className={`cg-tab${group === 'lobby' ? ' cg-tab--on' : ''}`}
          onClick={() => setGroup('lobby')}
        >
          <LayoutGrid size={15} strokeWidth={1.75} /> Lobby
        </button>
        {GROUPS.map(({ key, label }) => {
          const Icon = TAB_ICONS[key]
          return (
            <button
              key={key}
              className={`cg-tab${group === key ? ' cg-tab--on' : ''}`}
              onClick={() => setGroup(key)}
            >
              <Icon size={15} strokeWidth={1.75} /> {label}
            </button>
          )
        })}
      </div>

      {results ? (
        <div className="cg-grid">
          {results.length ? results.map(g => <GameTile key={g.id} game={g} />) : <p className="cg-empty">No games found.</p>}
        </div>
      ) : group === 'lobby' ? (
        GROUPS.map(({ key, label }) => <GameRow key={key} group={key} label={label} onMore={() => setGroup(key)} />)
      ) : (
        <div className="cg-grid">
          {GAMES.filter(g => g.group === group).map(g => <GameTile key={g.id} game={g} />)}
        </div>
      )}
    </div>
  )
}

export default Casino
