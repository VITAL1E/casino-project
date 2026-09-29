import { useEffect, useRef, useState, Suspense, lazy } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Maximize, PictureInPicture2, RectangleHorizontal, Heart, ChevronDown, Play, Loader } from 'lucide-react'
import { GAMES, GROUPS, getGame, gameMeta } from '../data/casino'
import { GameRow } from '../components/GameRow'

// Each game's engine/canvas code is its own chunk, fetched only once that
// specific game is opened — a visitor never downloads the other 8.
const Dice = lazy(() => import('../games/dice/Dice'))
const Slither = lazy(() => import('../games/slither/Slither'))
const Agar = lazy(() => import('../games/agar/Agar'))
const Chicken = lazy(() => import('../games/chicken/Chicken'))
const Paper = lazy(() => import('../games/paper/Paper'))
const Hole = lazy(() => import('../games/hole/Hole'))
const RoadCross = lazy(() => import('../games/roadcross/RoadCross'))
const StormRoyale = lazy(() => import('../games/storm/StormRoyale'))
const Flappy = lazy(() => import('../games/flappy/Flappy'))

// Originals we build ourselves; everything else waits for a provider iframe
const PLAYABLE: Partial<Record<string, React.ComponentType>> = { o1: Dice, o10: Slither, o11: Agar, o12: Chicken, o13: Paper, o14: Hole, o15: RoadCross, o16: Flappy, o17: StormRoyale }

// Keyed by id in Game below so switching games remounts this fresh — that's
// what resets session/theatre/fav/info, rather than an effect doing it.
const GameView = ({ id }: { id: string }) => {
  const navigate = useNavigate()
  const game = getGame(id)
  const frameRef = useRef<HTMLDivElement>(null)

  const [session, setSession] = useState<'idle' | 'loading' | 'ready'>('idle')
  const [theatre, setTheatre] = useState(false)
  const [fav, setFav] = useState(false)
  const [info, setInfo] = useState(true)

  useEffect(() => { window.scrollTo({ top: 0 }) }, [])

  useEffect(() => {
    if (session !== 'loading') return
    const t = setTimeout(() => setSession('ready'), 1200)
    return () => clearTimeout(t)
  }, [session])

  if (!game) {
    return (
      <div className="gp-page">
        <p className="cg-empty">Game not found. <Link to="/casino" className="gp-link">Back to casino</Link></p>
      </div>
    )
  }

  const meta = gameMeta(game)
  const groupLabel = GROUPS.find(g => g.key === game.group)?.label ?? 'Games'
  const art = game.img
    ? { backgroundImage: `url(${game.img})` }
    : { background: `linear-gradient(160deg, hsl(${game.hue} 85% 58%), hsl(${(game.hue ?? 0) + 40} 80% 28%))` }

  const Playable = PLAYABLE[game.id]

  return (
    <div className="gp-page">
      <div className="gp-crumbs">
        <Link to="/casino" className="gp-link">Casino</Link>
        <span>/</span>
        <Link to={`/casino?group=${game.group}`} className="gp-link">{groupLabel}</Link>
        <span>/</span>
        <b>{game.title}</b>
      </div>

      <div className="gp-player">
        <div
          ref={frameRef}
          className={`gp-frame${theatre ? ' gp-frame--theatre' : ''}${Playable ? ' gp-frame--native' : ''}`}
        >
          {Playable && (
            <Suspense fallback={<div className="gp-launch gp-launch--center"><Loader size={32} className="gp-spin" /></div>}>
              <Playable />
            </Suspense>
          )}

          {!Playable && session === 'idle' && (
            <div className="gp-launch">
              <div className="gp-launch-bg" style={art} />
              <div className="gp-launch-card">
                <div className="gp-launch-art" style={art} />
                <h1>{game.title}</h1>
                <p>{game.provider}</p>
                <div className="gp-launch-btns">
                  <button className="gp-btn gp-btn--primary" onClick={() => navigate('/')}>Play for real</button>
                  <button className="gp-btn" onClick={() => setSession('loading')}>
                    <Play size={16} strokeWidth={2} /> Play demo
                  </button>
                </div>
              </div>
            </div>
          )}

          {!Playable && session === 'loading' && (
            <div className="gp-launch gp-launch--center">
              <Loader size={32} className="gp-spin" />
              <p>Loading {game.title}…</p>
            </div>
          )}

          {!Playable && session === 'ready' && (
            <div className="gp-launch gp-launch--center">
              <span className="gp-demo-tag">DEMO</span>
              <p>{game.provider} game iframe loads here</p>
              <small>Connect a game aggregator to launch {game.title}</small>
            </div>
          )}
        </div>

        <div className="gp-toolbar">
          <button
            className="gp-tool"
            title="Fullscreen"
            onClick={() => frameRef.current?.requestFullscreen?.()}
          >
            <Maximize size={20} strokeWidth={1.75} />
          </button>
          <button className="gp-tool" title="Mini player">
            <PictureInPicture2 size={20} strokeWidth={1.75} />
          </button>
          <button
            className={`gp-tool${theatre ? ' gp-tool--on' : ''}`}
            title="Theatre mode"
            onClick={() => setTheatre(t => !t)}
          >
            <RectangleHorizontal size={20} strokeWidth={1.75} />
          </button>
          <button
            className={`gp-tool${fav ? ' gp-tool--fav' : ''}`}
            title="Favourite"
            onClick={() => setFav(f => !f)}
          >
            <Heart size={20} strokeWidth={1.75} fill={fav ? 'currentColor' : 'none'} />
          </button>
          <span className="gp-brand">STACK</span>
        </div>
      </div>

      <section className="gp-info">
        <button className="gp-info-head" onClick={() => setInfo(i => !i)}>
          <div>
            <h2>{game.title}</h2>
            <p>{game.provider}</p>
          </div>
          <ChevronDown size={20} className={info ? 'gp-chev gp-chev--open' : 'gp-chev'} />
        </button>
        {info && (
          <div className="gp-info-body">
            <div className="gp-stat"><span>RTP</span><b>{meta.rtp}%</b></div>
            <div className="gp-stat"><span>Volatility</span><b>{meta.volatility}</b></div>
            <div className="gp-stat"><span>Max win</span><b>{meta.maxWin}</b></div>
            <div className="gp-stat"><span>Category</span><b>{groupLabel}</b></div>
          </div>
        )}
      </section>

      {GAMES.filter(g => g.group === game.group && g.id !== game.id).length > 0 && (
        <GameRow
          group={game.group}
          label={`More ${groupLabel}`}
          onMore={() => navigate(`/casino?group=${game.group}`)}
        />
      )}
    </div>
  )
}

const Game = () => {
  const { id = '' } = useParams()
  return <GameView key={id} id={id} />
}

export default Game
