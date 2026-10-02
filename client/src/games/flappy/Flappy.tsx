import { useCallback, useEffect, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { useSolo } from '../net/useSolo'
import { DIFFS, GRAVITY, PIPE_W, BIRD_R, GROUND, BIRD_X, H as LH, multAt, round2, type DiffKey } from './engine'
import type { FlappySnap } from './net'

const BIRDS = [
  { emoji: '🐦', name: 'Bird', flip: true },
  { emoji: '🐝', name: 'Bee', flip: true },
  { emoji: '🦇', name: 'Bat', flip: false },
  { emoji: '👻', name: 'Ghost', flip: false },
  { emoji: '🦉', name: 'Owl', flip: false },
  { emoji: '🐧', name: 'Penguin', flip: false },
]

type Status = 'idle' | 'ready' | 'flying' | 'dead' | 'cashed'
// Mirror of the server's state: the server decides everything, this is only what we draw.
type Mirror = {
  status: Status
  y: number
  vy: number
  pipes: { x: number; gapY: number; passed: boolean }[]
  score: number
  t: number
  scroll: number
}

const cssVar = (el: Element, name: string) => getComputedStyle(el).getPropertyValue(name).trim()

const Flappy = () => {
  const [bet, setBet] = useState('1')
  const [diff, setDiff] = useState<DiffKey>('medium')
  const [bird, setBird] = useState(BIRDS[0].emoji)
  const [snapStatus, setSnapStatus] = useState<Status>('idle')
  const [score, setScore] = useState(0)

  const cfg = DIFFS.find(d => d.key === diff)!
  const amount = parseFloat(bet)

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const game = useRef<Mirror>({ status: 'idle', y: 260, vy: 0, pipes: [], score: 0, t: 0, scroll: 0 })
  const cosmetic = useRef({ hero: bird, flip: true, growth: cfg.growth, gap: cfg.gap, speed: cfg.speed })

  const onSnap = useCallback((s: FlappySnap) => {
    const g = game.current
    g.status = s.status
    g.y = s.y
    g.vy = s.vy
    g.pipes = s.pipes.map(([x, gapY, passed]) => ({ x, gapY, passed: passed === 1 }))
    g.score = s.score
    setSnapStatus(s.status)
    setScore(s.score)
  }, [])

  const solo = useSolo<FlappySnap>('flappy', onSnap)
  const { balance, phase, error, result, bet: stake } = solo

  const status: Status = phase === 'playing' ? snapStatus : phase === 'done' ? (result?.result === 'cash' ? 'cashed' : 'dead') : 'idle'
  const busy = phase === 'playing'
  const mult = multAt(score, cfg.growth)
  const nextMult = multAt(score + 1, cfg.growth)
  const payout = round2((busy ? stake : amount > 0 ? amount : 0) * mult)

  const play = () => {
    if (!(amount > 0)) return solo.setError('Enter a bet amount')
    if (balance !== null && amount > balance) return solo.setError('Insufficient balance')
    const b = BIRDS.find(x => x.emoji === bird)!
    cosmetic.current = { hero: bird, flip: b.flip, growth: cfg.growth, gap: cfg.gap, speed: cfg.speed }
    Object.assign(game.current, { status: 'ready', vy: 0, pipes: [], score: 0 })
    solo.start(amount, { diff })
  }

  const flap = useCallback(() => solo.act('flap'), [solo])
  const cashOut = useCallback(() => solo.act('cash'), [solo])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); flap() }
      if (e.code === 'Enter') { e.preventDefault(); cashOut() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flap, cashOut])

  const payoutRef = useRef(0)
  useEffect(() => { payoutRef.current = result?.payout ?? 0 }, [result])

  useEffect(() => {
    const canvas = canvasRef.current!
    const wrap = wrapRef.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0
    let prev = 0

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = wrap.clientWidth * dpr
      canvas.height = wrap.clientHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const col = {
      bg: cssVar(canvas, '--bg'),
      sky: cssVar(canvas, '--surface'),
      pipe: cssVar(canvas, '--win') || cssVar(canvas, '--accent'),
      ground: cssVar(canvas, '--surface-3'),
      white: cssVar(canvas, '--white'),
      yellow: cssVar(canvas, '--yellow'),
      lose: cssVar(canvas, '--lose') || cssVar(canvas, '--red'),
      dim: cssVar(canvas, '--text-mid'),
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (!prev) prev = now
      const dt = Math.min((now - prev) / 1000, 0.05)
      prev = now
      const g = game.current
      const c = cosmetic.current
      const W = wrap.clientWidth, H = wrap.clientHeight
      g.t += dt

      // between snapshots, keep things moving with the same equations the server uses
      if (g.status === 'flying') {
        g.vy += GRAVITY * dt
        g.y += g.vy * dt
        g.scroll += c.speed * dt
        for (const p of g.pipes) p.x -= c.speed * dt
      } else if (g.status === 'ready') {
        g.y = (LH - GROUND) / 2 + Math.sin(g.t * 5) * 8
      } else if (g.status === 'dead' && g.y < LH - GROUND - BIRD_R) {
        g.vy += GRAVITY * dt
        g.y = Math.min(LH - GROUND - BIRD_R, g.y + g.vy * dt)
      } else if (g.status === 'cashed') {
        g.y += Math.sin(g.t * 6) * 0.4
      }

      // logical world (LH tall, bird at BIRD_X) -> screen: bird sits at 28% of the width
      const k = H / LH
      const ox = W * 0.28 - BIRD_X * k
      const X = (x: number) => x * k + ox
      const Y = (y: number) => y * k

      ctx.fillStyle = col.bg
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = col.sky
      ctx.fillRect(0, 0, W, Y(LH - GROUND))

      for (const p of g.pipes) {
        const top = Y(p.gapY - c.gap / 2)
        const bottom = Y(p.gapY + c.gap / 2)
        const x = X(p.x), pw = PIPE_W * k
        ctx.fillStyle = col.pipe
        ctx.globalAlpha = 0.85
        ctx.fillRect(x, 0, pw, top)
        ctx.fillRect(x, bottom, pw, Y(LH - GROUND) - bottom)
        ctx.globalAlpha = 1
        ctx.fillRect(x - 5 * k, top - 22 * k, pw + 10 * k, 22 * k)
        ctx.fillRect(x - 5 * k, bottom, pw + 10 * k, 22 * k)

        if (!p.passed && g.status !== 'idle') {
          const idx = g.score + g.pipes.filter(q => !q.passed && q.x < p.x).length + 1
          ctx.font = '800 12px Manrope, sans-serif'
          ctx.textAlign = 'center'
          ctx.fillStyle = col.yellow
          ctx.fillText(`${multAt(idx, c.growth).toFixed(2)}×`, x + pw / 2, Y(p.gapY) + 4)
        }
      }

      // ground
      ctx.fillStyle = col.ground
      ctx.fillRect(0, Y(LH - GROUND), W, GROUND * k)
      ctx.strokeStyle = col.dim
      ctx.globalAlpha = 0.4
      ctx.lineWidth = 2
      ctx.setLineDash([16, 16])
      ctx.lineDashOffset = -g.scroll * k
      ctx.beginPath(); ctx.moveTo(0, Y(LH - GROUND / 2)); ctx.lineTo(W, Y(LH - GROUND / 2)); ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1

      // bird
      ctx.save()
      ctx.translate(X(BIRD_X), Y(g.y))
      const tilt = g.status === 'dead' ? Math.PI / 2 : Math.max(-0.5, Math.min(1.1, g.vy / 700))
      ctx.rotate(g.status === 'ready' || g.status === 'cashed' ? 0 : tilt)
      if (c.flip) ctx.scale(-1, 1)
      ctx.font = '32px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(c.hero, 0, 11)
      ctx.restore()

      // hud
      ctx.textAlign = 'center'
      if (g.status !== 'idle') {
        ctx.font = '800 34px Manrope, sans-serif'
        ctx.fillStyle = g.status === 'dead' ? col.lose : col.yellow
        ctx.fillText(`${multAt(g.score, c.growth).toFixed(2)}×`, W / 2, 50)
        ctx.font = '700 12px Manrope, sans-serif'
        ctx.fillStyle = col.dim
        ctx.fillText(`${g.score} pipe${g.score === 1 ? '' : 's'} passed`, W / 2, 70)
      }
      if (g.status === 'ready') {
        ctx.font = '800 16px Manrope, sans-serif'
        ctx.fillStyle = col.white
        ctx.fillText('Tap, click or press Space to flap', W / 2, H / 2 + 70)
      }
      if (g.status === 'dead') {
        ctx.font = '800 26px Manrope, sans-serif'
        ctx.fillStyle = col.lose
        ctx.fillText('CRASH!', W / 2, H / 2)
      }
      if (g.status === 'cashed') {
        ctx.font = '800 26px Manrope, sans-serif'
        ctx.fillStyle = col.yellow
        ctx.fillText(`Cashed out +${payoutRef.current.toFixed(2)}`, W / 2, H / 2)
      }
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])

  const offlineMsg = phase === 'offline' && solo.offline !== 'login'
  const last = phase === 'done' && result
    ? { win: result.result === 'cash', amount: result.result === 'cash' ? result.payout : result.bet }
    : null

  return (
    <div className="dc">
      <div className="dc-top">
        <div className="dc-balance">
          <span>Balance</span>
          <b>{balance === null ? '—' : balance.toFixed(2)}</b>
        </div>
        <button className="dc-reset" onClick={solo.reset} title="Reset balance">
          <RotateCcw size={14} /> Reset
        </button>
      </div>

      <div className="dc-main">
        <div className="dc-controls">
          <label className="dc-label">Bet amount</label>
          <div className="dc-bet">
            <input type="number" aria-label="Bet amount" min="0" step="0.01" value={bet} disabled={busy} onChange={e => setBet(e.target.value)} />
            <button disabled={busy} onClick={() => setBet(b => String(round2(Math.max(0.01, (parseFloat(b) || 0.02) / 2))))}>½</button>
            <button disabled={busy} onClick={() => setBet(b => String(round2((parseFloat(b) || 0) * 2)))}>2×</button>
          </div>

          <label className="dc-label">Difficulty</label>
          <div className="rc-chips">
            {DIFFS.map(d => (
              <button key={d.key} disabled={busy} className={`rc-chip${diff === d.key ? ' rc-chip--on' : ''}`} onClick={() => setDiff(d.key)}>
                {d.label}
              </button>
            ))}
          </div>
          <small className="rc-hint">Each pipe multiplies your bet by {cfg.growth}×</small>

          <label className="dc-label">Character</label>
          <div className="rc-chips">
            {BIRDS.map(b => (
              <button key={b.emoji} disabled={busy} title={b.name} className={`rc-chip rc-chip--emoji${bird === b.emoji ? ' rc-chip--on' : ''}`} onClick={() => setBird(b.emoji)}>
                {b.emoji}
              </button>
            ))}
          </div>

          {busy ? (
            <>
              <button className="dc-roll" onClick={flap}>Flap</button>
              <button className="rc-cash" onClick={cashOut} disabled={status !== 'flying' || score < 1}>
                Cash out {score >= 1 ? payout.toFixed(2) : ''}
              </button>
              <small className="rc-hint">Next pipe: {nextMult.toFixed(2)}×</small>
            </>
          ) : (
            <button className="dc-roll" onClick={play} disabled={phase === 'connecting' || offlineMsg}>{status === 'idle' ? 'Play' : 'Play again'}</button>
          )}

          {last && (
            <p className={last.win ? 'rc-note rc-note--win' : 'dc-error'}>
              {last.win ? `Cashed out +${last.amount.toFixed(2)}` : `Crashed! Lost ${last.amount.toFixed(2)}`}
            </p>
          )}
          {error && <p className="dc-error">{error}</p>}
          {phase === 'offline' && solo.offline === 'server' && <p className="dc-error">Cannot reach the game server. Make sure it is running (npm run server).</p>}
          {phase === 'offline' && solo.offline === 'lost' && (
            <p className="dc-error">Connection lost. <button className="gp-link" onClick={solo.reconnect}>Reconnect</button></p>
          )}
          <small className="rc-hint">Space / ↑ / click to flap · Enter to cash out · results are decided on the server</small>
        </div>

        <div className="dc-board rc-board" ref={wrapRef}>
          <canvas ref={canvasRef} className="rc-canvas" onPointerDown={flap} />
        </div>
      </div>
    </div>
  )
}

export default Flappy
