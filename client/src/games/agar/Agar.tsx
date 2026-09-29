import { useCallback, useEffect, useRef, useState } from 'react'
import { RotateCcw, Trophy, Skull, FastForward } from 'lucide-react'
import { useDemoBalance, round2 } from '../../hooks/useDemoBalance'
import { createWorld, step, zoneRadius, radiusOf, ROUND_SEC, PLAYERS, type World } from './engine'

type Phase = 'lobby' | 'playing' | 'done'
type Hud = { t: number; alive: number; hp: number; len: number; me: boolean; board: { name: string; len: number; me: boolean; alive: boolean }[] }

const cssVar = (el: Element, name: string) => getComputedStyle(el).getPropertyValue(name).trim()

const Agar = () => {
  const { balance, setBalance, reset } = useDemoBalance()

  const [bet, setBet] = useState('1')
  const [phase, setPhase] = useState<Phase>('lobby')
  const [error, setError] = useState('')
  const [hud, setHud] = useState<Hud | null>(null)
  const [result, setResult] = useState<{ place: number; payout: number; kills: number; stake: number } | null>(null)

  const amount = parseFloat(bet)
  const pool = round2((amount > 0 ? amount : 0) * PLAYERS)

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const world = useRef<World | null>(null)
  const wantRef = useRef<number | undefined>(undefined)
  const stake = useRef(0)

  const finish = useCallback((w: World) => {
    const me = w.cells.find(c => c.human)!
    const payout = me.id === w.winner ? round2(stake.current * PLAYERS) : 0
    if (payout > 0) setBalance(b => b + payout)
    setResult({ place: me.place, payout, kills: me.kills, stake: stake.current })
    setPhase('done')
  }, [setBalance])

  const start = () => {
    if (!(amount > 0)) return setError('Enter a bet amount')
    if (amount > balance) return setError('Insufficient balance')
    setError('')
    stake.current = amount
    setBalance(b => b - amount)
    world.current = createWorld()
    wantRef.current = undefined
    setResult(null)
    setHud(null)
    setPhase('playing')
  }

  const skip = () => {
    const w = world.current
    if (!w) return
    while (!w.over) step(w, 0.05)
  }

  // game loop + rendering
  useEffect(() => {
    if (phase !== 'playing') return
    const canvas = canvasRef.current!
    const wrap = wrapRef.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0
    let last = performance.now()
    let hudAt = 0
    const cam = { x: 0, y: 0 }

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = wrap.clientWidth * dpr
      canvas.height = wrap.clientHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const bg = cssVar(canvas, '--bg')
    const grid = cssVar(canvas, '--surface-2')
    const danger = cssVar(canvas, '--lose') || cssVar(canvas, '--red')
    const accent = cssVar(canvas, '--accent')
    const white = cssVar(canvas, '--white')

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const w = world.current!
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      step(w, dt, wantRef.current)

      const me = w.cells.find(c => c.human)!
      const W = wrap.clientWidth
      const H = wrap.clientHeight

      // camera: follow player, or the current leader once eliminated
      const focus = me.alive ? me : w.cells.filter(c => c.alive).sort((a, b) => b.mass - a.mass)[0] ?? me
      cam.x += (focus.x - cam.x) * Math.min(1, dt * 8)
      cam.y += (focus.y - cam.y) * Math.min(1, dt * 8)
      const zoom = Math.max(0.45, 1 - (radiusOf(focus) - 13) / 150) * Math.min(W, H * 1.4) / 900
      const sx = (x: number) => (x - cam.x) * zoom + W / 2
      const sy = (y: number) => (y - cam.y) * zoom + H / 2

      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)

      // dotted grid
      const gs = 60 * zoom
      ctx.fillStyle = grid
      for (let x = ((-cam.x * zoom + W / 2) % gs + gs) % gs; x < W; x += gs)
        for (let y = ((-cam.y * zoom + H / 2) % gs + gs) % gs; y < H; y += gs)
          ctx.fillRect(x - 1, y - 1, 2, 2)

      // danger zone outside the safe circle
      const R = zoneRadius(w.t)
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, W, H)
      ctx.arc(sx(0), sy(0), R * zoom, 0, Math.PI * 2, true)
      ctx.globalAlpha = 0.22
      ctx.fillStyle = danger
      ctx.fill('evenodd')
      ctx.restore()
      ctx.strokeStyle = danger
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(sx(0), sy(0), R * zoom, 0, Math.PI * 2)
      ctx.stroke()

      // food
      for (const f of w.food) {
        const x = sx(f.x), y = sy(f.y)
        if (x < -10 || y < -10 || x > W + 10 || y > H + 10) continue
        ctx.fillStyle = `hsl(${f.hue} 90% 60%)`
        ctx.beginPath()
        ctx.arc(x, y, (2 + f.v * 0.5) * zoom + 1, 0, Math.PI * 2)
        ctx.fill()
      }

      // cells, smallest first so big ones draw on top
      for (const c of [...w.cells].filter(c => c.alive).sort((p, q) => p.mass - q.mass)) {
        const r = radiusOf(c) * zoom
        const x = sx(c.x), y = sy(c.y)
        ctx.fillStyle = `hsl(${c.hue} 80% 52%)`
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = `hsl(${c.hue} 85% 68%)`
        ctx.lineWidth = Math.max(2, r * 0.08)
        ctx.stroke()
        ctx.fillStyle = c.human ? accent : white
        ctx.font = `800 ${Math.max(10, r * 0.42)}px Manrope, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(c.name, x, y)
        ctx.textBaseline = 'alphabetic'
      }

      if (w.over) {
        cancelAnimationFrame(raf)
        setHud(null)
        finish(w)
        return
      }

      if (now - hudAt > 100) {
        hudAt = now
        setHud({
          t: w.t,
          alive: w.cells.filter(c => c.alive).length,
          hp: me.hp,
          len: me.mass,
          me: me.alive,
          board: [...w.cells]
            .sort((a, b) => Number(b.alive) - Number(a.alive) || b.mass - a.mass)
            .slice(0, 5)
            .map(c => ({ name: c.name, len: c.mass, me: c.human, alive: c.alive })),
        })
      }
    }
    raf = requestAnimationFrame(frame)

    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [phase, finish])

  const aim = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    wantRef.current = Math.atan2(e.clientY - (rect.top + rect.height / 2), e.clientX - (rect.left + rect.width / 2))
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
          <h2>Agar Royale</h2>
          <p>10 cells, 1 minute, winner takes the whole pool. Eat smaller cells, avoid bigger ones, and stay inside the shrinking zone.</p>
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
          <canvas
            ref={canvasRef}
            className="sl-canvas"
            onPointerMove={aim}
            onPointerDown={aim}
          />

          {hud && (
            <>
              <div className="sl-hud sl-hud--tl">
                <div className="sl-chip"><span>Time</span><b>{timeLeft}s</b></div>
                <div className="sl-chip"><span>Alive</span><b>{hud.alive}/{PLAYERS}</b></div>
                <div className="sl-chip"><span>Pool</span><b>{pool.toFixed(2)}</b></div>
              </div>

              <div className="sl-hud sl-hud--tr">
                {hud.board.map(b => (
                  <div key={b.name} className={`sl-row${b.me ? ' sl-row--me' : ''}${b.alive ? '' : ' sl-row--dead'}`}>
                    <span>{b.name}</span><b>{Math.floor(b.len)}</b>
                  </div>
                ))}
              </div>

              <div className="sl-hud sl-hud--bottom">
                <div className="sl-hp"><div className="sl-hp-fill" style={{ width: `${hud.hp}%` }} /></div>
                <small>{hud.me ? `Size ${Math.floor(hud.len)} · move your mouse to steer` : 'You were eliminated'}</small>
                {!hud.me && (
                  <button className="gp-btn" onClick={skip}><FastForward size={15} /> Skip to result</button>
                )}
              </div>
            </>
          )}

          {phase === 'done' && result && (
            <div className="sl-result">
              <div className={`sl-result-card${result.payout > 0 ? ' sl-result-card--win' : ''}`}>
                {result.payout > 0 ? <Trophy size={34} /> : <Skull size={34} />}
                <h2>{result.payout > 0 ? `You won ${result.payout.toFixed(2)}` : `Placed #${result.place}`}</h2>
                <p>{result.payout > 0 ? 'Biggest cell standing.' : `You lost ${result.stake.toFixed(2)}.`} Kills: {result.kills}</p>
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

export default Agar
