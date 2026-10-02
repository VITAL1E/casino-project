// Shared UI + client loop for the server-authoritative arcade games (Agar, Hole, Paper, Chicken, Storm...).
// The server runs the match; this component only shows the matchmaking lobby, renders the
// mirror world built from server snapshots (2D canvas draw, or a game-provided 3D mount), and sends inputs.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { RotateCcw, Trophy, Skull, Loader, Users } from 'lucide-react'
import { getWallet, resetWallet } from '../../lib/walletApi'
import { ApiError } from '../../lib/apiClient'
import { me } from '../../lib/authApi'
import { useAuth } from '../../lib/auth/context'
import { BUY_INS, QUEUE_SEC, type NetServerMsg, type SeatInfo } from './protocol'
import { openNetSocket, type NetSocket } from './socket'

export const PLAYERS = 10
export const ROUND_SEC = 60

export type Colors = Record<'bg' | 'grid' | 'surface' | 'danger' | 'accent' | 'white' | 'yellow', string>

export type HudData = {
  t: number
  chips: { label: string; value: string }[]
  board: { name: string; value: string; me: boolean; alive: boolean }[]
  note: string
  me: boolean
  bar?: { value: number; max: number }   // optional health bar
}

// What a 3D game gets from the shell: the live mirror world and a throttled way to send inputs.
export type MountApi<W> = {
  world: () => W
  send: (fields: Record<string, unknown>) => boolean   // false when throttled: retry next frame
  ui: (data: unknown) => void   // push game-specific UI state to the adapter's overlay
}

export type OverlayProps = { hud: (HudData & { begin: number }) | null; ui: unknown; timeLeft: number; pool: number }

export type NetAdapter<W, S, I = unknown> = {
  key: string
  title: string
  blurb: string
  roundSec?: number
  // mirror world: entities carry `human: true` for our own seat only, so draw/hud code keeps working unchanged
  create: (you: number, seats: SeatInfo[], init: I) => W
  apply: (w: W, snap: S) => void
  smooth?: (w: W, dt: number) => void
  hud: (w: W) => HudData
  // 2D games draw into the shell's canvas and describe how the pointer steers...
  draw?: (ctx: CanvasRenderingContext2D, w: W, W: number, H: number, c: Colors, now: number) => void
  aim?: (w: W, px: number, py: number, W: number, H: number) => Record<string, unknown>   // fields of the 'in' message
  // ...3D games own their renderer and input; returns a cleanup function
  mount?: (wrap: HTMLDivElement, api: MountApi<W>) => () => void
  stageClass?: string                        // extra class on the stage element
  overlay?: (p: OverlayProps) => ReactNode   // replaces the generic HUD (chips / leaderboard / bar)
}

type Phase = 'connecting' | 'lobby' | 'queue' | 'playing' | 'done' | 'offline'
type Result = { place: number; payout: number; kills: number; stake: number; winner: string }

const cssVar = (el: Element, name: string) => getComputedStyle(el).getPropertyValue(name).trim()

const NetShell = <W, S, I>({ adapter }: { adapter: NetAdapter<W, S, I> }) => {
  const { user, openAuth, guestLogin } = useAuth()
  const pendingJoin = useRef<number | null>(null)   // TEMPORARY (guest play): join as soon as the new session's socket is ready
  const roundSec = adapter.roundSec ?? ROUND_SEC

  const [balance, setBalance] = useState<number | null>(null)
  const [walletError, setWalletError] = useState('')
  const [buyIn, setBuyIn] = useState<number>(BUY_INS[0])
  const [phase, setPhase] = useState<Phase>('connecting')
  const [queue, setQueue] = useState<{ players: number; max: number; endsAt: number } | null>(null)
  const [clock, setClock] = useState(() => Date.now())
  const [error, setError] = useState('')
  const [hud, setHud] = useState<(HudData & { begin: number }) | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [connKey, setConnKey] = useState(0)
  const [ui, setUi] = useState<unknown>(null)
  const [offline, setOffline] = useState<'login' | 'server' | 'lost'>('lost')

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sock = useRef<NetSocket | null>(null)
  const world = useRef<W | null>(null)
  const beginAt = useRef(0)
  const pointer = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const seq = useRef(0)
  const phaseRef = useRef<Phase>('connecting')
  const lastSent = useRef({ at: 0, key: '' })

  const pool = buyIn * PLAYERS
  useEffect(() => { phaseRef.current = phase }, [phase])

  useEffect(() => {
    const onMsg = (msg: NetServerMsg) => {
      switch (msg.t) {
        case 'ready':
          setBalance(msg.balance)
          if (!msg.resume) setPhase(p => (p === 'connecting' || p === 'offline' ? 'lobby' : p))   // else queued/start follows
          if (pendingJoin.current !== null && !msg.resume) { sock.current?.send({ t: 'join', bet: pendingJoin.current }); pendingJoin.current = null }
          break
        case 'queued':
          setBalance(msg.balance)
          setBuyIn(msg.bet)
          setError('')
          world.current = null
          setPhase('queue')
          break
        case 'queue':
          setQueue({ players: msg.players, max: msg.max, endsAt: Date.now() + msg.startsInMs })
          break
        case 'left':
          setBalance(msg.balance)
          setQueue(null)
          world.current = null
          setPhase('lobby')
          break
        case 'start': {
          // a re-sent start (reconnect mid-match) keeps the existing world so a 3D scene stays valid
          if (!world.current) world.current = adapter.create(msg.you, msg.seats, msg.init as I)
          adapter.apply(world.current, msg.snap as S)
          beginAt.current = performance.now() + msg.beginsInMs
          seq.current = 0
          setBuyIn(msg.bet)
          setQueue(null)
          setResult(null)
          setHud(null)
          setError('')
          setPhase('playing')
          break
        }
        case 'snap':
          if (world.current) adapter.apply(world.current, msg.snap as S)
          break
        case 'end':
          setBalance(msg.balance)
          if (document.pointerLockElement) document.exitPointerLock()   // 3D games capture the mouse
          setResult({ place: msg.place, payout: msg.payout, kills: msg.kills, stake: msg.bet, winner: msg.winner })
          setPhase('done')
          break
        case 'error':
          setError(msg.message)
          break
      }
    }
    sock.current = openNetSocket(adapter.key, onMsg, () => {
      sock.current = null
      // the browser hides why a WebSocket upgrade failed, so ask the API: logged out, server down, or something else
      me()
        .then(u => setOffline(u ? 'lost' : 'login'))
        .catch(() => setOffline('server'))
        .finally(() => setPhase('offline'))
    })
    return () => { sock.current?.close(); sock.current = null }
  }, [connKey, adapter, user?.id])   // logging in or out reconnects with the new session

  useEffect(() => {
    if (phase !== 'queue') return
    const id = setInterval(() => setClock(Date.now()), 250)
    return () => clearInterval(id)
  }, [phase])

  const join = async () => {
    if (phase === 'offline' && offline === 'login') {
      // TEMPORARY: with GUEST_PLAY=1 on the server a guest account is created and the join continues; otherwise the login modal opens
      if (await guestLogin()) { pendingJoin.current = buyIn; return }
      return openAuth('login')
    }
    setError('')
    sock.current?.send({ t: 'join', bet: buyIn })
  }
  const leave = () => sock.current?.send({ t: 'leave' })

  const reset = async () => {
    try { setBalance((await resetWallet()).balance); setWalletError('') }
    catch (e) { setWalletError(e instanceof ApiError ? e.message : 'Could not reset your balance') }
  }
  const refreshWallet = () => { getWallet().then(r => setBalance(r.balance)).catch(() => { /* the socket keeps the balance current */ }) }

  // input: send only changes (plus a slow heartbeat); the server validates and rate-limits
  const sendInput = (fields: Record<string, unknown>): boolean => {
    const now = performance.now()
    if (phaseRef.current !== 'playing' || now < beginAt.current) return false
    const key = JSON.stringify(fields)
    const { at, key: prev } = lastSent.current
    if (key === prev ? now - at < 500 : now - at < 17) return false   // <= ~58 inputs/s, under the server's 60Hz consumption
    lastSent.current = { at: now, key }
    sock.current?.send({ t: 'in', seq: ++seq.current, ...fields })
    return true
  }

  const onStage = phase === 'playing' || phase === 'done'

  // HUD numbers, refreshed a few times a second
  useEffect(() => {
    if (phase !== 'playing') return
    const id = setInterval(() => {
      const w = world.current
      if (w) setHud({ ...adapter.hud(w), begin: Math.max(0, Math.ceil((beginAt.current - performance.now()) / 1000)) })
    }, 100)
    return () => clearInterval(id)
  }, [phase, adapter])

  // 3D games: hand the stage to the game's own renderer for as long as the stage is shown
  useEffect(() => {
    if (!onStage || !adapter.mount || !wrapRef.current || !world.current) return
    return adapter.mount(wrapRef.current, { world: () => world.current as W, send: sendInput, ui: setUi })
  }, [onStage, adapter])

  // 2D games: render loop over the mirror world + input sampling
  useEffect(() => {
    if (!onStage || adapter.mount || !adapter.draw) return
    const canvas = canvasRef.current!
    const wrap = wrapRef.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0
    let last = performance.now()

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
      const w = world.current
      if (!w) return
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      adapter.smooth?.(w, dt)
      adapter.draw!(ctx, w, wrap.clientWidth, wrap.clientHeight, colors, now)

      // steering: sample the pointer and send the newest aim
      if (pointer.current && adapter.aim) {
        const p = pointer.current
        sendInput(adapter.aim(w, p.x, p.y, p.w, p.h))
      }
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [onStage, adapter])

  const aim = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    pointer.current = { x: e.clientX - rect.left, y: e.clientY - rect.top, w: rect.width, h: rect.height }
  }

  const timeLeft = hud ? Math.max(0, Math.ceil(roundSec - hud.t)) : roundSec
  const queueLeft = queue ? Math.max(0, Math.ceil((queue.endsAt - clock) / 1000)) : QUEUE_SEC
  const lobbyOpen = phase === 'lobby' || (phase === 'offline' && offline === 'login')

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
          <h2>{adapter.title}</h2>
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

      {lobbyOpen && (
        <div className="sl-lobby">
          <h2>{adapter.title}</h2>
          <p>{adapter.blurb}</p>
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
        <div className={`sl-stage${adapter.stageClass ? ` ${adapter.stageClass}` : ''}`} ref={wrapRef}>
          {!adapter.mount && <canvas ref={canvasRef} className="sl-canvas" onPointerMove={aim} onPointerDown={aim} />}

          {phase === 'playing' && adapter.overlay && adapter.overlay({ hud, ui, timeLeft, pool })}

          {phase === 'playing' && !adapter.overlay && hud && (
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
                {hud.bar && <div className="sl-hp"><div className="sl-hp-fill" style={{ width: `${(hud.bar.value / hud.bar.max) * 100}%` }} /></div>}
                <small>{hud.me ? hud.note : 'You were eliminated — watching until the match ends'}</small>
              </div>

              {hud.begin > 0 && <div className="sl-go">{hud.begin}</div>}
            </>
          )}

          {phase === 'done' && result && (
            <div className="sl-result">
              <div className={`sl-result-card${result.payout > 0 ? ' sl-result-card--win' : ''}`}>
                {result.payout > 0 ? <Trophy size={34} /> : <Skull size={34} />}
                <h2>{result.payout > 0 ? `You won ${result.payout.toFixed(2)}` : `Placed #${result.place}`}</h2>
                <p>{result.payout > 0 ? 'Top of the leaderboard.' : `${result.winner} won. You lost ${result.stake.toFixed(2)}.`} Kills: {result.kills}</p>
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

export default NetShell
