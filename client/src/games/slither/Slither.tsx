import { useCallback, useEffect, useRef, useState } from 'react'
import { RotateCcw, Trophy, Skull, FastForward } from 'lucide-react'
import { round2 } from '../../hooks/useDemoBalance'
import { createWorld, step, zoneRadius, radiusOf, ROUND_SEC, PLAYERS, TICK, type World } from './engine'
import type { RecordedInput } from './replay'
import { getWallet, resetWallet, startRound, finishRound, ApiError } from './api'

type Phase = 'lobby' | 'playing' | 'done'
type Hud = { t: number; alive: number; hp: number; len: number; me: boolean; board: { name: string; len: number; me: boolean; alive: boolean }[] }

const cssVar = (el: Element, name: string) => getComputedStyle(el).getPropertyValue(name).trim()

const Slither = () => {
  // The balance lives on the server (see server/index.ts) — this game no
  // longer trusts anything the browser itself says about money.
  const [balance, setBalanceState] = useState<number | null>(null)
  const [walletError, setWalletError] = useState('')

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
  const boostRef = useRef(false)
  const stake = useRef(0)
  const roundId = useRef('')
  const inputLog = useRef<RecordedInput[]>([])

  // Reusable for the retry-after-error path below; the mount fetch is
  // inlined in its own effect instead of calling this, since setState
  // only ever happens after the await (a later microtask), not during
  // the effect's own synchronous run.
  const loadWallet = useCallback(async () => {
    try { setBalanceState((await getWallet()).balance); setWalletError('') }
    catch (e) { setWalletError(e instanceof ApiError ? e.message : 'Could not load your balance') }
  }, [])

  useEffect(() => {
    let cancelled = false
    getWallet()
      .then(r => { if (!cancelled) { setBalanceState(r.balance); setWalletError('') } })
      .catch(e => { if (!cancelled) setWalletError(e instanceof ApiError ? e.message : 'Could not load your balance') })
    return () => { cancelled = true }
  }, [])

  const reset = async () => {
    try { setBalanceState((await resetWallet()).balance); setWalletError('') }
    catch (e) { setWalletError(e instanceof ApiError ? e.message : 'Could not reset your balance') }
  }

  // The server already replayed the round and decided this — we just show it.
  const finish = useCallback(async (w: World) => {
    try {
      const r = await finishRound(roundId.current, inputLog.current)
      setBalanceState(r.balance)
      setResult({ place: r.place, payout: r.payout, kills: r.kills, stake: stake.current })
    } catch (e) {
      // the round already happened on screen either way; tell the player plainly
      // rather than pretending to know a result the server never confirmed
      const me = w.snakes.find(s => s.human)!
      setError(e instanceof ApiError ? e.message : 'Could not verify the round result')
      setResult({ place: me.place, payout: 0, kills: me.kills, stake: stake.current })
      loadWallet()
    }
    setPhase('done')
  }, [loadWallet])

  const start = async () => {
    if (!(amount > 0)) return setError('Enter a bet amount')
    if (balance !== null && amount > balance) return setError('Insufficient balance')
    setError('')
    try {
      const r = await startRound(amount)
      stake.current = amount
      roundId.current = r.roundId
      inputLog.current = []
      setBalanceState(r.balance)
      world.current = createWorld(r.seed)   // seed comes from the server, never chosen locally
      wantRef.current = undefined
      boostRef.current = false
      setResult(null)
      setHud(null)
      setPhase('playing')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start a round')
    }
  }

  const skip = () => {
    const w = world.current
    if (!w) return
    while (!w.over) { step(w, TICK, wantRef.current, boostRef.current); inputLog.current.push({ want: wantRef.current ?? w.snakes.find(s => s.human)!.want, boost: boostRef.current }) }
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

    let acc = 0
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const w = world.current!
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now

      // fixed-step simulation so a recorded input log replays identically on
      // the server later — the round is only ever "real" once the server has
      // re-run it from these same ticks
      acc += dt
      while (acc >= TICK && !w.over) {
        step(w, TICK, wantRef.current, boostRef.current)
        inputLog.current.push({ want: wantRef.current ?? w.snakes.find(s => s.human)!.want, boost: boostRef.current })
        acc -= TICK
      }

      const me = w.snakes.find(s => s.human)!
      const W = wrap.clientWidth
      const H = wrap.clientHeight

      // camera: follow player, or the current leader once eliminated
      const focus = me.alive ? me : w.snakes.filter(s => s.alive).sort((a, b) => b.len - a.len)[0] ?? me
      cam.x += (focus.x - cam.x) * Math.min(1, dt * 8)
      cam.y += (focus.y - cam.y) * Math.min(1, dt * 8)
      const zoom = Math.max(0.55, 1 - (focus.len - 100) / 1400) * Math.min(W, H * 1.4) / 900
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

      // snakes (dead ones vanish; their body already turned into food)
      for (const s of w.snakes) {
        if (!s.alive) continue
        const r = radiusOf(s) * zoom
        for (let i = s.body.length - 1; i >= 0; i--) {
          const p = s.body[i]
          const x = sx(p.x), y = sy(p.y)
          if (x < -r || y < -r || x > W + r || y > H + r) continue
          ctx.fillStyle = `hsl(${s.hue} 80% ${i % 2 ? 52 : 46}%)`
          ctx.beginPath()
          ctx.arc(x, y, r, 0, Math.PI * 2)
          ctx.fill()
        }
        const hx = sx(s.x), hy = sy(s.y)
        ctx.fillStyle = `hsl(${s.hue} 85% 60%)`
        ctx.beginPath()
        ctx.arc(hx, hy, r * 1.05, 0, Math.PI * 2)
        ctx.fill()
        for (const side of [-1, 1]) {
          const ea = s.angle + side * 0.6
          const ex = hx + Math.cos(ea) * r * 0.55
          const ey = hy + Math.sin(ea) * r * 0.55
          ctx.fillStyle = white
          ctx.beginPath(); ctx.arc(ex, ey, r * 0.32, 0, Math.PI * 2); ctx.fill()
          ctx.fillStyle = bg
          ctx.beginPath(); ctx.arc(ex + Math.cos(s.angle) * r * 0.1, ey + Math.sin(s.angle) * r * 0.1, r * 0.16, 0, Math.PI * 2); ctx.fill()
        }
        ctx.fillStyle = s.human ? accent : white
        ctx.font = `700 ${Math.max(10, 12 * zoom)}px Manrope, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText(s.name, hx, hy - r - 8)
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
          alive: w.snakes.filter(s => s.alive).length,
          hp: me.hp,
          len: me.len,
          me: me.alive,
          board: [...w.snakes]
            .sort((a, b) => Number(b.alive) - Number(a.alive) || b.len - a.len)
            .slice(0, 5)
            .map(s => ({ name: s.name, len: s.len, me: s.human, alive: s.alive })),
        })
      }
    }
    raf = requestAnimationFrame(frame)

    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [phase, finish])

  // input
  useEffect(() => {
    if (phase !== 'playing') return
    const down = (e: KeyboardEvent) => { if (e.code === 'Space') { e.preventDefault(); boostRef.current = true } }
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') boostRef.current = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [phase])

  const aim = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    wantRef.current = Math.atan2(e.clientY - (rect.top + rect.height / 2), e.clientX - (rect.left + rect.width / 2))
  }

  const timeLeft = hud ? Math.max(0, Math.ceil(ROUND_SEC - hud.t)) : ROUND_SEC

  return (
    <div className="sl">
      <div className="sl-top">
        <div className="dc-balance">
          <span>Balance</span>
          <b>{balance === null ? '—' : balance.toFixed(2)}</b>
        </div>
        <button className="dc-reset" onClick={reset} title="Reset balance">
          <RotateCcw size={14} /> Reset
        </button>
      </div>

      {phase === 'lobby' && (
        <div className="sl-lobby">
          <h2>Slither Royale</h2>
          <p>10 snakes, 1 minute, winner takes the whole pool. Get eaten or melt outside the shrinking zone and you're out.</p>
          <p className="rc-hint">Verified server-side: the round's outcome is decided by replaying it on the server, not by this browser.</p>
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
          <button className="dc-roll" onClick={start} disabled={balance === null}>Join round</button>
          {error && <p className="dc-error">{error}</p>}
          {walletError && <p className="dc-error">{walletError}</p>}
        </div>
      )}

      {phase !== 'lobby' && (
        <div className="sl-stage" ref={wrapRef}>
          <canvas
            ref={canvasRef}
            className="sl-canvas"
            onPointerMove={aim}
            onPointerDown={e => { aim(e); boostRef.current = true }}
            onPointerUp={() => { boostRef.current = false }}
            onPointerLeave={() => { boostRef.current = false }}
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
                <small>{hud.me ? `Length ${Math.floor(hud.len)} · hold click / space to boost` : 'You were eliminated'}</small>
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
                <p>{result.payout > 0 ? 'Last snake standing.' : `You lost ${result.stake.toFixed(2)}.`} Kills: {result.kills}</p>
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

export default Slither
