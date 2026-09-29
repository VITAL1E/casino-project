import { useCallback, useEffect, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { useDemoBalance, round2 } from '../../hooks/useDemoBalance'

const GRAVITY = 1500
const FLAP = -430
const PIPE_W = 64
const SPACING = 250
const BIRD_R = 15
const GROUND = 36
const MAX_PIPES = 60

const DIFFS = [
  { key: 'easy',   label: 'Easy',   gap: 178, speed: 150, growth: 1.09 },
  { key: 'medium', label: 'Medium', gap: 150, speed: 175, growth: 1.16 },
  { key: 'hard',   label: 'Hard',   gap: 128, speed: 205, growth: 1.27 },
] as const

const BIRDS = [
  { emoji: '🐦', name: 'Bird', flip: true },
  { emoji: '🐝', name: 'Bee', flip: true },
  { emoji: '🦇', name: 'Bat', flip: false },
  { emoji: '👻', name: 'Ghost', flip: false },
  { emoji: '🦉', name: 'Owl', flip: false },
  { emoji: '🐧', name: 'Penguin', flip: false },
]

const multAt = (n: number, growth: number) => (n === 0 ? 1 : round2(Math.pow(growth, n)))

type Status = 'idle' | 'ready' | 'flying' | 'dead' | 'cashed'
type Pipe = { x: number; gapY: number; passed: boolean }
type Game = {
  status: Status
  y: number
  vy: number
  pipes: Pipe[]
  score: number
  growth: number
  gap: number
  speed: number
  hero: string
  flip: boolean
  t: number
  endAt: number
  payout: number
  scroll: number
}

const cssVar = (el: Element, name: string) => getComputedStyle(el).getPropertyValue(name).trim()

const Flappy = () => {
  const { balance, setBalance, reset } = useDemoBalance()

  const [bet, setBet] = useState('1')
  const [diff, setDiff] = useState<(typeof DIFFS)[number]['key']>('medium')
  const [bird, setBird] = useState(BIRDS[0].emoji)
  const [status, setStatus] = useState<Status>('idle')
  const [score, setScore] = useState(0)
  const [error, setError] = useState('')
  const [last, setLast] = useState<{ win: boolean; amount: number } | null>(null)

  const cfg = DIFFS.find(d => d.key === diff)!
  const amount = parseFloat(bet)
  const mult = multAt(score, cfg.growth)
  const nextMult = multAt(score + 1, cfg.growth)
  const payout = round2((amount > 0 ? amount : 0) * mult)

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const game = useRef<Game>({
    status: 'idle', y: 200, vy: 0, pipes: [], score: 0, growth: cfg.growth, gap: cfg.gap, speed: cfg.speed,
    hero: bird, flip: true, t: 0, endAt: 0, payout: 0, scroll: 0,
  })
  const stake = useRef(0)

  const busy = status === 'ready' || status === 'flying'

  const play = () => {
    if (!(amount > 0)) return setError('Enter a bet amount')
    if (amount > balance) return setError('Insufficient balance')
    setError('')
    setLast(null)
    stake.current = amount
    setBalance(b => b - amount)
    const H = wrapRef.current?.clientHeight ?? 520
    const b = BIRDS.find(x => x.emoji === bird)!
    Object.assign(game.current, {
      status: 'ready', y: (H - GROUND) / 2, vy: 0, pipes: [], score: 0,
      growth: cfg.growth, gap: cfg.gap, speed: cfg.speed, hero: bird, flip: b.flip, endAt: 0, payout: 0,
    })
    setScore(0)
    setStatus('ready')
  }

  const flap = useCallback(() => {
    const g = game.current
    if (g.status === 'ready') {
      g.status = 'flying'
      setStatus('flying')
    }
    if (g.status === 'flying') g.vy = FLAP
  }, [])

  const cashOut = useCallback(() => {
    const g = game.current
    if (g.status !== 'flying' || g.score < 1) return
    const win = round2(stake.current * multAt(g.score, g.growth))
    g.status = 'cashed'
    g.endAt = g.t
    g.payout = win
    setBalance(b => b + win)
    setLast({ win: true, amount: win })
    setStatus('cashed')
  }, [setBalance])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); flap() }
      if (e.code === 'Enter') { e.preventDefault(); cashOut() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flap, cashOut])

  useEffect(() => {
    const canvas = canvasRef.current!
    const wrap = wrapRef.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0
    let prev = performance.now()

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

    const birdX = () => wrap.clientWidth * 0.28

    const physics = (g: Game, h: number, W: number, H: number) => {
      const bx = birdX()
      g.vy += GRAVITY * h
      g.y += g.vy * h
      g.scroll += g.speed * h

      for (const p of g.pipes) p.x -= g.speed * h
      while (g.pipes.length && g.pipes[0].x < -PIPE_W - 10) g.pipes.shift()
      if (g.pipes.length < 7 && g.pipes.length < MAX_PIPES) {
        const lastX = g.pipes.length ? g.pipes[g.pipes.length - 1].x : W * 0.9 - SPACING
        const m = 60
        g.pipes.push({
          x: lastX + SPACING,
          gapY: m + g.gap / 2 + Math.random() * (H - GROUND - 2 * m - g.gap),
          passed: false,
        })
      }

      let crashed = g.y - BIRD_R < 0 || g.y + BIRD_R > H - GROUND
      for (const p of g.pipes) {
        if (!p.passed && p.x + PIPE_W < bx - BIRD_R) {
          p.passed = true
          g.score++
          setScore(g.score)
        }
        const inX = bx + BIRD_R * 0.8 > p.x && bx - BIRD_R * 0.8 < p.x + PIPE_W
        if (inX && (g.y - BIRD_R * 0.8 < p.gapY - g.gap / 2 || g.y + BIRD_R * 0.8 > p.gapY + g.gap / 2)) crashed = true
      }
      if (crashed) {
        g.y = Math.min(g.y, H - GROUND - BIRD_R)
        g.status = 'dead'
        g.endAt = g.t
        setLast({ win: false, amount: stake.current })
        setStatus('dead')
      }
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min((now - prev) / 1000, 0.05)
      prev = now
      const g = game.current
      const W = wrap.clientWidth, H = wrap.clientHeight
      g.t += dt

      if (g.status === 'ready') {
        g.y = (H - GROUND) / 2 + Math.sin(g.t * 5) * 8
      } else if (g.status === 'flying') {
        const n = Math.ceil(dt / 0.008)
        for (let i = 0; i < n && g.status === 'flying'; i++) physics(g, dt / n, W, H)
      } else if (g.status === 'dead' && g.y < H - GROUND - BIRD_R) {
        g.vy += GRAVITY * dt
        g.y = Math.min(H - GROUND - BIRD_R, g.y + g.vy * dt)
      } else if (g.status === 'cashed') {
        g.y += Math.sin(g.t * 6) * 0.4
      }

      // ---------- draw ----------
      const bx = birdX()
      ctx.fillStyle = col.bg
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = col.sky
      ctx.fillRect(0, 0, W, H - GROUND)

      // pipes
      for (const p of g.pipes) {
        const top = p.gapY - g.gap / 2
        const bottom = p.gapY + g.gap / 2
        ctx.fillStyle = col.pipe
        ctx.globalAlpha = 0.85
        ctx.fillRect(p.x, 0, PIPE_W, top)
        ctx.fillRect(p.x, bottom, PIPE_W, H - GROUND - bottom)
        ctx.globalAlpha = 1
        ctx.fillStyle = col.pipe
        ctx.fillRect(p.x - 5, top - 22, PIPE_W + 10, 22)
        ctx.fillRect(p.x - 5, bottom, PIPE_W + 10, 22)

        const idx = g.score + g.pipes.filter(q => !q.passed && q.x < p.x).length + 1
        if (!p.passed && g.status !== 'idle') {
          ctx.font = '800 12px Manrope, sans-serif'
          ctx.textAlign = 'center'
          ctx.fillStyle = col.yellow
          ctx.fillText(`${multAt(idx, g.growth).toFixed(2)}×`, p.x + PIPE_W / 2, p.gapY + 4)
        }
      }

      // ground
      ctx.fillStyle = col.ground
      ctx.fillRect(0, H - GROUND, W, GROUND)
      ctx.strokeStyle = col.dim
      ctx.globalAlpha = 0.4
      ctx.lineWidth = 2
      ctx.setLineDash([16, 16])
      ctx.lineDashOffset = -g.scroll
      ctx.beginPath(); ctx.moveTo(0, H - GROUND / 2); ctx.lineTo(W, H - GROUND / 2); ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1

      // bird
      ctx.save()
      ctx.translate(bx, g.y)
      const tilt = g.status === 'dead' ? Math.PI / 2 : Math.max(-0.5, Math.min(1.1, g.vy / 700))
      ctx.rotate(g.status === 'ready' || g.status === 'cashed' ? 0 : tilt)
      if (g.flip) ctx.scale(-1, 1)
      ctx.font = '32px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(g.hero, 0, 11)
      ctx.restore()

      // hud
      ctx.textAlign = 'center'
      if (g.status !== 'idle') {
        ctx.font = '800 34px Manrope, sans-serif'
        ctx.fillStyle = g.status === 'dead' ? col.lose : col.yellow
        ctx.fillText(`${multAt(g.score, g.growth).toFixed(2)}×`, W / 2, 50)
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
        ctx.fillText(`Cashed out +${g.payout.toFixed(2)}`, W / 2, H / 2)
      }
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])

  return (
    <div className="dc">
      <div className="dc-top">
        <div className="dc-balance">
          <span>Demo balance</span>
          <b>{balance.toFixed(2)}</b>
        </div>
        <button className="dc-reset" onClick={reset} title="Reset demo balance">
          <RotateCcw size={14} /> Reset
        </button>
      </div>

      <div className="dc-main">
        <div className="dc-controls">
          <label className="dc-label">Bet amount</label>
          <div className="dc-bet">
            <input type="number" min="0" step="0.01" value={bet} disabled={busy} onChange={e => setBet(e.target.value)} />
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
            <button className="dc-roll" onClick={play}>{status === 'idle' ? 'Play' : 'Play again'}</button>
          )}

          {last && (
            <p className={last.win ? 'rc-note rc-note--win' : 'dc-error'}>
              {last.win ? `Cashed out +${last.amount.toFixed(2)}` : `Crashed! Lost ${last.amount.toFixed(2)}`}
            </p>
          )}
          {error && <p className="dc-error">{error}</p>}
          <small className="rc-hint">Space / ↑ / click to flap · Enter to cash out</small>
        </div>

        <div className="dc-board rc-board" ref={wrapRef}>
          <canvas ref={canvasRef} className="rc-canvas" onPointerDown={flap} />
        </div>
      </div>
    </div>
  )
}

export default Flappy
