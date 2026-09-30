import { useCallback, useEffect, useRef, useState } from 'react'
import { RotateCcw, Trophy, Skull, Loader, Users } from 'lucide-react'
import { zoneRadius, advanceSnake, ROUND_SEC, PLAYERS, TICK, type Mover } from './engine'
import { BUY_INS, QUEUE_SEC, SNAPSHOT_HZ, type FoodSnap, type SeatInfo, type ServerMsg, type Snap, type SnakeSnap } from './protocol'
import { getWallet, resetWallet, openSocket, ApiError, type SlitherSocket } from './api'
import { me } from '../../lib/authApi'
import { useAuth } from '../../lib/auth/context'

type Phase = 'connecting' | 'lobby' | 'queue' | 'playing' | 'done' | 'offline'
type Hud = { t: number; begin: number; alive: number; hp: number; len: number; me: boolean; board: { name: string; len: number; me: boolean; alive: boolean }[] }
type Result = { place: number; payout: number; kills: number; stake: number; winner: string }
type Frame = { snap: Snap; at: number }
type SentInput = { seq: number; want: number; boost: boolean }
// Client-side prediction state for our own snake: the movement the server has not
// acknowledged yet is replayed on top of each authoritative snapshot.
type Prediction = { s: Mover; seq: number; hist: SentInput[] }
const MAX_HISTORY = 240

const cssVar = (el: Element, name: string) => getComputedStyle(el).getPropertyValue(name).trim()
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const radiusOf = (len: number) => 7 + Math.min(len / 120, 7)

const Slither = () => {
  const { user, openAuth } = useAuth()
  // The balance and the whole game live on the server. This component only
  // renders snapshots and sends steering inputs; it never decides an outcome.
  const [balance, setBalance] = useState<number | null>(null)
  const [walletError, setWalletError] = useState('')
  const [buyIn, setBuyIn] = useState<number>(BUY_INS[0])
  const [phase, setPhase] = useState<Phase>('connecting')
  const [queue, setQueue] = useState<{ players: number; max: number; endsAt: number } | null>(null)
  const [clock, setClock] = useState(() => Date.now())
  const [error, setError] = useState('')
  const [hud, setHud] = useState<Hud | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [connKey, setConnKey] = useState(0)
  const [offline, setOffline] = useState<'login' | 'server' | 'lost'>('lost')   // why the socket is down

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sock = useRef<SlitherSocket | null>(null)
  const frames = useRef<{ prev: Frame | null; cur: Frame | null }>({ prev: null, cur: null })
  const food = useRef(new Map<number, FoodSnap>())
  const meta = useRef<{ you: number; seats: SeatInfo[]; bet: number; beginAt: number } | null>(null)
  const pred = useRef<Prediction | null>(null)
  const wantRef = useRef<number | undefined>(undefined)
  const boostRef = useRef(false)

  const pool = buyIn * PLAYERS

  // Rewind our snake to the server's state, then replay the inputs the server has not applied yet.
  const reconcile = useCallback((own: SnakeSnap) => {
    if (!own.al) { pred.current = null; return }
    const hist = (pred.current?.hist ?? []).filter(h => h.seq > own.ack)
    const body = []
    for (let i = 0; i < own.b.length; i += 2) body.push({ x: own.b[i], y: own.b[i + 1] })
    const s: Mover = { x: own.x, y: own.y, angle: own.a, want: own.a, boost: own.bo, len: own.len, drip: 0, body }
    for (const h of hist) { s.want = h.want; s.boost = h.boost; advanceSnake(s, TICK) }
    pred.current = { s, seq: pred.current?.seq ?? 0, hist }
  }, [])

  const applySnap = useCallback((snap: Snap) => {
    for (const id of snap.foodDel) food.current.delete(id)
    for (const f of snap.foodAdd) food.current.set(f[0], f)
    frames.current = { prev: frames.current.cur, cur: { snap, at: performance.now() } }
    if (meta.current) reconcile(snap.snakes[meta.current.you])
  }, [reconcile])

  // one socket per connection attempt; the server resumes a queue/match we were already in
  useEffect(() => {
    const onMsg = (msg: ServerMsg) => {
      switch (msg.t) {
        case 'ready':
          setBalance(msg.balance)
          if (!msg.resume) setPhase(p => (p === 'connecting' || p === 'offline' ? 'lobby' : p))   // else the queued/start message follows
          break
        case 'queued':
          setBalance(msg.balance)
          setBuyIn(msg.bet)
          setError('')
          setPhase('queue')
          break
        case 'queue':
          setQueue({ players: msg.players, max: msg.max, endsAt: Date.now() + msg.startsInMs })
          break
        case 'left':
          setBalance(msg.balance)
          setQueue(null)
          setPhase('lobby')
          break
        case 'start':
          meta.current = { you: msg.you, seats: msg.seats, bet: msg.bet, beginAt: performance.now() + msg.beginsInMs }
          setBuyIn(msg.bet)
          food.current.clear()
          frames.current = { prev: null, cur: null }
          pred.current = null   // fresh connection: the server restarts our input counter
          applySnap(msg.snap)
          wantRef.current = undefined
          boostRef.current = false
          setQueue(null)
          setResult(null)
          setHud(null)
          setError('')
          setPhase('playing')
          break
        case 'snap':
          applySnap(msg.snap)
          break
        case 'end':
          setBalance(msg.balance)
          setResult({ place: msg.place, payout: msg.payout, kills: msg.kills, stake: msg.bet, winner: msg.winner })
          setPhase('done')
          break
        case 'error':
          setError(msg.message)
          break
      }
    }
    sock.current = openSocket(onMsg, () => {
      sock.current = null
      // the browser hides why a WebSocket upgrade failed, so ask the API: logged out, server down, or something else
      me()
        .then(u => setOffline(u ? 'lost' : 'login'))
        .catch(() => setOffline('server'))
        .finally(() => setPhase('offline'))
    })
    return () => { sock.current?.close(); sock.current = null }
  }, [connKey, applySnap, user?.id])   // logging in or out reconnects with the new session

  useEffect(() => {
    if (phase !== 'queue') return
    const id = setInterval(() => setClock(Date.now()), 250)
    return () => clearInterval(id)
  }, [phase])

  const join = () => {
    if (phase === 'offline' && offline === 'login') return openAuth('login')   // logged out: the login modal opens instead
    setError('')
    sock.current?.send({ t: 'join', bet: buyIn })
  }
  const leave = () => sock.current?.send({ t: 'leave' })

  const reset = async () => {
    try { setBalance((await resetWallet()).balance); setWalletError('') }
    catch (e) { setWalletError(e instanceof ApiError ? e.message : 'Could not reset your balance') }
  }
  const refreshWallet = () => {
    getWallet().then(r => setBalance(r.balance)).catch(() => { /* the socket keeps the balance current */ })
  }

  // render loop: interpolates between the two newest server snapshots
  useEffect(() => {
    if (phase !== 'playing' && phase !== 'done') return
    const canvas = canvasRef.current!
    const wrap = wrapRef.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0
    let last = performance.now()
    let hudAt = 0
    let acc = 0
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
      const { prev, cur } = frames.current
      const m = meta.current
      if (!cur || !m) return
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const t = prev ? Math.min(1, (now - cur.at) / (1000 / SNAPSHOT_HZ)) : 1

      // prediction: one local tick per 1/60s — apply the input now, send it tagged with a
      // sequence number, and keep it until the server acknowledges it
      const p = pred.current
      if (p && phase === 'playing' && now >= m.beginAt) {
        acc += dt
        while (acc >= TICK) {
          acc -= TICK
          const want = wantRef.current ?? p.s.angle
          const boost = boostRef.current
          const seq = ++p.seq
          p.hist.push({ seq, want, boost })
          if (p.hist.length > MAX_HISTORY) p.hist.shift()
          sock.current?.send({ t: 'in', seq, want, boost })
          p.s.want = want
          p.s.boost = boost
          advanceSnake(p.s, TICK)
        }
      }

      const W = wrap.clientWidth
      const H = wrap.clientHeight
      const snap = cur.snap

      // head/body positions blended between the previous and current snapshot
      const view = snap.snakes.map((s, i) => {
        const p = prev?.snap.snakes[i]
        return { s, p: p && p.al && s.al ? p : undefined }
      })
      // our own snake is drawn from the prediction, everyone else from interpolated snapshots
      const pos = (v: { s: SnakeSnap; p?: SnakeSnap }) =>
        v.s.id === m.you && p ? p.s : { x: lerp(v.p?.x ?? v.s.x, v.s.x, t), y: lerp(v.p?.y ?? v.s.y, v.s.y, t) }

      const meSnake = snap.snakes[m.you]
      const leader = snap.snakes.filter(s => s.al).sort((a, b) => b.len - a.len)[0]
      const focus = meSnake.al ? meSnake : leader ?? meSnake
      const fp = pos(view[focus.id])
      cam.x += (fp.x - cam.x) * Math.min(1, dt * 8)
      cam.y += (fp.y - cam.y) * Math.min(1, dt * 8)
      const zoom = Math.max(0.55, 1 - (focus.len - 100) / 1400) * Math.min(W, H * 1.4) / 900
      const sx = (x: number) => (x - cam.x) * zoom + W / 2
      const sy = (y: number) => (y - cam.y) * zoom + H / 2

      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)

      const gs = 60 * zoom
      ctx.fillStyle = grid
      for (let x = ((-cam.x * zoom + W / 2) % gs + gs) % gs; x < W; x += gs)
        for (let y = ((-cam.y * zoom + H / 2) % gs + gs) % gs; y < H; y += gs)
          ctx.fillRect(x - 1, y - 1, 2, 2)

      const R = zoneRadius(snap.time)
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

      for (const [, fx, fy, fv, fh] of food.current.values()) {
        const x = sx(fx), y = sy(fy)
        if (x < -10 || y < -10 || x > W + 10 || y > H + 10) continue
        ctx.fillStyle = `hsl(${fh} 90% 60%)`
        ctx.beginPath()
        ctx.arc(x, y, (2 + fv * 0.5) * zoom + 1, 0, Math.PI * 2)
        ctx.fill()
      }

      for (const v of view) {
        const { s, p: prevSnake } = v
        if (!s.al) continue
        const seat = m.seats[s.id]
        const mine = s.id === m.you && p ? p.s : null
        const angle = mine ? mine.angle : s.a
        const r = radiusOf(mine ? mine.len : s.len) * zoom
        const n = mine ? mine.body.length : s.b.length / 2
        for (let i = n - 1; i >= 0; i--) {
          const bx = mine ? mine.body[i].x : lerp(prevSnake?.b[i * 2] ?? s.b[i * 2], s.b[i * 2], t)
          const by = mine ? mine.body[i].y : lerp(prevSnake?.b[i * 2 + 1] ?? s.b[i * 2 + 1], s.b[i * 2 + 1], t)
          const x = sx(bx), y = sy(by)
          if (x < -r || y < -r || x > W + r || y > H + r) continue
          ctx.fillStyle = `hsl(${seat.hue} 80% ${i % 2 ? 52 : 46}%)`
          ctx.beginPath()
          ctx.arc(x, y, r, 0, Math.PI * 2)
          ctx.fill()
        }
        const hp = pos(v)
        const hx = sx(hp.x), hy = sy(hp.y)
        ctx.fillStyle = `hsl(${seat.hue} 85% 60%)`
        ctx.beginPath()
        ctx.arc(hx, hy, r * 1.05, 0, Math.PI * 2)
        ctx.fill()
        for (const side of [-1, 1]) {
          const ea = angle + side * 0.6
          const ex = hx + Math.cos(ea) * r * 0.55
          const ey = hy + Math.sin(ea) * r * 0.55
          ctx.fillStyle = white
          ctx.beginPath(); ctx.arc(ex, ey, r * 0.32, 0, Math.PI * 2); ctx.fill()
          ctx.fillStyle = bg
          ctx.beginPath(); ctx.arc(ex + Math.cos(angle) * r * 0.1, ey + Math.sin(angle) * r * 0.1, r * 0.16, 0, Math.PI * 2); ctx.fill()
        }
        ctx.fillStyle = s.id === m.you ? accent : white
        ctx.font = `700 ${Math.max(10, 12 * zoom)}px Manrope, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText(seat.name, hx, hy - r - 8)
      }

      if (now - hudAt > 100) {
        hudAt = now
        setHud({
          t: snap.time,
          begin: Math.max(0, Math.ceil((m.beginAt - now) / 1000)),
          alive: snap.snakes.filter(s => s.al).length,
          hp: meSnake.hp,
          len: meSnake.len,
          me: meSnake.al,
          board: [...snap.snakes]
            .sort((a, b) => Number(b.al) - Number(a.al) || b.len - a.len)
            .slice(0, 5)
            .map(s => ({ name: m.seats[s.id].name, len: s.len, me: s.id === m.you, alive: s.al })),
        })
      }
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [phase])

  // keyboard boost; steering inputs are sent from the render loop at a fixed 60Hz
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
  const queueLeft = queue ? Math.max(0, Math.ceil((queue.endsAt - clock) / 1000)) : QUEUE_SEC

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

      {(phase === 'connecting' || (phase === 'offline' && offline !== 'login')) && (
        <div className="sl-lobby">
          <h2>Slither Royale</h2>
          {phase === 'connecting'
            ? <p className="sl-wait"><Loader size={16} className="gp-spin" /> Connecting…</p>
            : (
              <>
                <p>{offline === 'server'
                  ? 'Cannot reach the game server. Make sure it is running (npm run server) and try again.'
                  : 'Connection lost. If you were in a match it keeps running and pays out to your account.'}</p>
                <button className="dc-roll" onClick={() => { setPhase('connecting'); setConnKey(k => k + 1) }}>Reconnect</button>
              </>
            )}
          {walletError && <p className="dc-error">{walletError}</p>}
        </div>
      )}

      {(phase === 'lobby' || (phase === 'offline' && offline === 'login')) && (
        <div className="sl-lobby">
          <h2>Slither Royale</h2>
          <p>10 snakes, 1 minute, winner takes the whole pool. Get eaten or melt outside the shrinking zone and you're out.</p>
          <p className="rc-hint">Server-authoritative: the server runs the match and decides the result. Your browser only sends steering. We wait {QUEUE_SEC}s for other players, then bots fill the empty seats.</p>
          <div>
            <label className="dc-label">Buy-in</label>
            <div className="sl-tiers">
              {BUY_INS.map(b => (
                <button key={b} className={`sl-tier${b === buyIn ? ' sl-tier--on' : ''}`} onClick={() => setBuyIn(b)}>{b}</button>
              ))}
            </div>
          </div>
          <div className="sl-lobby-grid">
            <div className="dc-field"><span>Players</span><b>Up to {PLAYERS}</b></div>
            <div className="dc-field"><span>Prize pool</span><b>{pool.toFixed(2)}</b></div>
          </div>
          <button className="dc-roll" onClick={join} disabled={phase === 'lobby' && (balance === null || balance < buyIn)}>Find match</button>
          {phase === 'lobby' && balance !== null && balance < buyIn && <p className="dc-error">Insufficient balance</p>}
          {error && <p className="dc-error">{error}</p>}
          {walletError && <p className="dc-error">{walletError}</p>}
        </div>
      )}

      {phase === 'queue' && (
        <div className="sl-lobby sl-queue">
          <Loader size={34} className="gp-spin" />
          <h2>Finding players…</h2>
          <p><Users size={14} /> {queue?.players ?? 1}/{queue?.max ?? PLAYERS} players · buy-in {buyIn}</p>
          <p>{queueLeft > 0 ? `Starting in ${queueLeft}s — bots fill any empty seats` : 'Starting…'}</p>
          <button className="gp-btn" onClick={leave}>Cancel and refund</button>
          {error && <p className="dc-error">{error}</p>}
        </div>
      )}

      {(phase === 'playing' || phase === 'done') && (
        <div className="sl-stage" ref={wrapRef}>
          <canvas
            ref={canvasRef}
            className="sl-canvas"
            onPointerMove={aim}
            onPointerDown={e => { aim(e); boostRef.current = true }}
            onPointerUp={() => { boostRef.current = false }}
            onPointerLeave={() => { boostRef.current = false }}
          />

          {phase === 'playing' && hud && (
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
                <small>{hud.me ? `Length ${Math.floor(hud.len)} · hold click / space to boost` : 'You were eliminated — watching until the match ends'}</small>
              </div>

              {hud.begin > 0 && <div className="sl-go">{hud.begin}</div>}
            </>
          )}

          {phase === 'done' && result && (
            <div className="sl-result">
              <div className={`sl-result-card${result.payout > 0 ? ' sl-result-card--win' : ''}`}>
                {result.payout > 0 ? <Trophy size={34} /> : <Skull size={34} />}
                <h2>{result.payout > 0 ? `You won ${result.payout.toFixed(2)}` : `Placed #${result.place}`}</h2>
                <p>{result.payout > 0 ? 'Last snake standing.' : `${result.winner} won. You lost ${result.stake.toFixed(2)}.`} Kills: {result.kills}</p>
                <div className="sl-result-btns">
                  <button className="dc-roll" onClick={() => { setPhase('lobby'); join(); refreshWallet() }}>Play again</button>
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
