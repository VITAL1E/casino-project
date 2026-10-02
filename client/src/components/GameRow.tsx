import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Sparkles, Gamepad2, Dices, Star, Tv2, Layers } from 'lucide-react'
import { GAMES, type Game, type GameGroup } from '../data/casino'

export const TAB_ICONS = { arcade: Gamepad2, classics: Dices, slots: Star, live: Tv2, shows: Layers, new: Sparkles }

export const GameTile = ({ game }: { game: Game }) => {
  const hasClassicArt = game.group === 'classics' && Boolean(game.img)
  const titleInArt = !game.img || game.group === 'arcade' || game.group === 'classics'
  const longWord = game.title.split(' ').some(w => w.length > 7)   // one long word cannot wrap, so it gets a smaller size
  return (
  <Link to={`/casino/games/${game.id}`} className="cg-tile" aria-label={game.title}>
    <div
      className={`cg-art${game.img && titleInArt && !hasClassicArt ? ' cg-art--shade' : ''}`}
      style={
        game.img
          ? { backgroundImage: `url(${game.img})` }
          : { background: `linear-gradient(160deg, hsl(${game.hue} 85% 58%), hsl(${(game.hue ?? 0) + 40} 80% 28%))` }
      }
    >
      {titleInArt && !hasClassicArt && <span className={`cg-art-title${longWord ? ' cg-art-title--long' : ''}`}>{game.title}</span>}
      {game.mode
        ? <span className={`cg-mode cg-mode--${game.mode}`}>{game.mode === 'multi' ? 'Multiplayer' : 'Single-player'}</span>
        : <span className="cg-provider">{game.provider}</span>}
      <span className="cg-play">PLAY</span>
    </div>
    {!titleInArt && <p className="cg-name">{game.title}</p>}
  </Link>
  )
}

export const Row = ({
  icon, label, onMore, children,
}: { icon: ReactNode; label: string; onMore: () => void; children: ReactNode }) => {
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ prev: false, next: true })   // which arrows can still scroll

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setEdges({ prev: el.scrollLeft > 1, next: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 })
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)   // also fires once on observe, which sets the initial state
    ro.observe(el)
    for (const child of el.children) ro.observe(child)
    return () => { el.removeEventListener('scroll', update); ro.disconnect() }
  }, [])
  const scroll = (dir: number) =>
    ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' })

  return (
    <section className="cg-row">
      <div className="cg-row-head">
        <button className="cg-row-title" onClick={onMore}>
          {icon}
          {label}
        </button>
        <div className="cg-arrows">
          <button className="cg-arrow" onClick={() => scroll(-1)} disabled={!edges.prev} aria-label="Previous"><ChevronLeft size={18} /></button>
          <button className="cg-arrow" onClick={() => scroll(1)} disabled={!edges.next} aria-label="Next"><ChevronRight size={18} /></button>
        </div>
      </div>
      <div className="cg-scroller" ref={ref}>{children}</div>
    </section>
  )
}

export const GameRow = ({ group, label, onMore }: { group: GameGroup; label: string; onMore: () => void }) => {
  const Icon = TAB_ICONS[group]
  return (
    <Row icon={<Icon size={18} strokeWidth={1.75} />} label={label} onMore={onMore}>
      {GAMES.filter(g => g.group === group).map(g => <GameTile key={g.id} game={g} />)}
    </Row>
  )
}
