import { useCallback, useEffect, useRef, useState } from 'react'
import { RotateCcw, Trophy, Skull, FastForward } from 'lucide-react'
import { useDemoBalance, round2 } from '../../hooks/useDemoBalance'

export const PLAYERS = 10
export const ROUND_SEC = 60

export type Colors = Record<'bg' | 'grid' | 'surface' | 'danger' | 'accent' | 'white' | 'yellow', string>

export type HudData = {
  t: number
  chips: { label: string; value: string }[]
  board: { name: string; value: string; me: boolean; alive: boolean }[]
  note: string
  me: boolean
}

export type Adapter<W> = {
  title: string
  blurb: string
  create: () => W
  step: (w: W, dt: number, want?: number) => void
  over: (w: W) => boolean
  time: (w: W) => number
  result: (w: W) => { won: boolean; place: number; kills: number }
  hud: (w: W) => HudData
  draw: (ctx: CanvasRenderingContext2D, w: W, W: number, H: number, c: Colors, now: number) => void
  aim: (w: W, px: number, py: number, W: number, H: number) => number
  skip: (w: W) => void
}

type Phase = 'lobby' | 'playing' | 'done'

const cssVar = (el: Element, name: string) => getComputedStyle(el).getPropertyValue(name).trim()

const RoyaleShell = <W,>({ adapter }: { adapter: Adapter<W> }) => {
  const { balance, setBalance, reset } = useDemoBalance()

  const [bet, setBet] = useState('1')
  const [phase, setPhase] = useState<Phase>('lobby')
  const [error, setError] = useState('')
  const [hud, setHud] = useState<HudData | null>(null)
  const [result, setResult] = useState<{ won: boolean; place: number; kills: number; payout: number; stake: number } | null>(null)

  const amount = parseFloat(bet)
  const pool = round2((amount > 0 ? amount : 0) * PLAYERS)

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const world = useRef<W | null>(null)
  const wantRef = useRef<number | undefined>(undefined)
  const stake = useRef(0)

  const finish = useCallback((w: W) => {
    const r = adapter.result(w)
    const payout = r.won ? round2(stake.current * PLAYERS) : 0
    if (payout > 0) setBalance(b => b + payout)
    setResult({ ...r, payout, stake: stake.current })
    setPhase('done')
  }, [adapter, setBalance])

  const start = () => {
    if (!(amount > 0)) return setError('Enter a bet amount')
    if (amount > balance) return setError('Insufficient balance')
    setError('')
    stake.current = amount
    setBalance(b => b - amount)
    world.current = adapter.create()
    wantRef.current = undefined
    setResult(null)
    setHud(null)
    setPhase('playing')
  }

  useEffect(() => {
    if (phase !== 'playing') return
    const canvas = canvasRef.current!
    const wrap = wrapRef.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0
    let last = performance.now()
    let hudAt = 0

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = wrap.clientWidth * dpr
      canvas.height = wrap.clientHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const colors: Colors = {
      bg: cssVar(canvas, '--bg'),
      grid: cssVar(canvas, '--surface-2'),
      surface: cssVar(canvas, '--surface'),
      danger: cssVar(canvas, '--lose') || cssVar(canvas, '--red'),
      accent: cssVar(canvas, '--accent'),
      white: cssVar(canvas, '--white'),
      yellow: cssVar(canvas, '--yellow'),
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const w = world.current!
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      adapter.step(w, dt, wantRef.current)
      adapter.draw(ctx, w, wrap.clientWidth, wrap.clientHeight, colors, now)

      if (adapter.over(w)) {
        cancelAnimationFrame(raf)
        setHud(null)
        finish(w)
        return
      }
      if (now - hudAt > 100) {
        hudAt = now
        setHud(adapter.hud(w))
      }
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [phase, adapter, finish])

  const aim = (e: React.PointerEvent) => {
    const w = world.current
    if (!w) return
    const rect = e.currentTarget.getBoundingClientRect()
    wantRef.current = adapter.aim(w, e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height)
  }

  const timeLeft = hud ? Math.max(0, Math.ceil(ROUND_SEC - hud.t)) : ROUND_SEC

  return (
    <div className="sl">
      <div className="sl-top">
        <div className="dc-balance">
          <span>Demo balance</span>
          <b>{balance.toFixed(2)}</b>
        </div>
        <button className="dc-reset" onClick={reset} title="Reset demo balance">
          <RotateCcw size={14} /> Reset
        </button>
      </div>

      {phase === 'lobby' && (
        <div className="sl-lobby">
          <h2>{adapter.title}</h2>
          <p>{adapter.blurb}</p>
          <div className="sl-lobby-grid">
            <div>
              <label className="dc-label">Buy-in</label>
              <div className="dc-bet">
                <input type="number" min="0" step="0.01" value={bet} onChange={e => setBet(e.target.value)} />
                <button onClick={() => setBet(b => String(round2(Math.max(0.01, (parseFloat(b) || 0.02) / 2))))}>½</button>
                <button onClick={() => setBet(b => String(round2((parseFloat(b) || 0) * 2)))}>2×</button>
              </div>
            </div>
            <div className="dc-field"><span>Players</span><b>You + 9 bots</b></div>
            <div className="dc-field"><span>Prize pool</span><b>{pool.toFixed(2)}</b></div>
          </div>
          <button className="dc-roll" onClick={start}>Join round</button>
          {error && <p className="dc-error">{error}</p>}
        </div>
      )}

      {phase !== 'lobby' && (
        <div className="sl-stage" ref={wrapRef}>
          <canvas ref={canvasRef} className="sl-canvas" onPointerMove={aim} onPointerDown={aim} />

          {hud && (
            <>
              <div className="sl-hud sl-hud--tl">
                <div className="sl-chip"><span>Time</span><b>{timeLeft}s</b></div>
                {hud.chips.map(c => (
                  <div key={c.label} className="sl-chip"><span>{c.label}</span><b>{c.value}</b></div>
                ))}
                <div className="sl-chip"><span>Pool</span><b>{pool.toFixed(2)}</b></div>
              </div>

              <div className="sl-hud sl-hud--tr">
                {hud.board.map(b => (
                  <div key={b.name} className={`sl-row${b.me ? ' sl-row--me' : ''}${b.alive ? '' : ' sl-row--dead'}`}>
                    <span>{b.name}</span><b>{b.value}</b>
                  </div>
                ))}
              </div>

              <div className="sl-hud sl-hud--bottom">
                <small>{hud.me ? hud.note : 'You were eliminated'}</small>
                {!hud.me && (
                  <button className="gp-btn" onClick={() => adapter.skip(world.current as W)}><FastForward size={15} /> Skip to result</button>
                )}
              </div>
            </>
          )}

          {phase === 'done' && result && (
            <div className="sl-result">
              <div className={`sl-result-card${result.payout > 0 ? ' sl-result-card--win' : ''}`}>
                {result.payout > 0 ? <Trophy size={34} /> : <Skull size={34} />}
                <h2>{result.payout > 0 ? `You won ${result.payout.toFixed(2)}` : `Placed #${result.place}`}</h2>
                <p>{result.payout > 0 ? 'Top of the leaderboard.' : `You lost ${result.stake.toFixed(2)}.`} Kills: {result.kills}</p>
                <div className="sl-result-btns">
                  <button className="dc-roll" onClick={start}>Play again</button>
                  <button className="gp-btn" onClick={() => setPhase('lobby')}>Change bet</button>
                </div>
                {error && <p className="dc-error">{error}</p>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default RoyaleShell
