import { useCallback, useEffect, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { useSolo } from '../net/useSolo'
import FairPanel from '../classics/FairPanel'
import { BetInput, History } from '../classics/ui'
import { num } from '../classics/useClassic'
import { crashMultAt } from '../classics/math'

type Snap = { status: 'live' | 'dead' | 'cashed'; t: number; mult: number; point?: number }
const cssVar = (el: Element, name: string) => getComputedStyle(el).getPropertyValue(name).trim()

const Crash = () => {
  const [bet, setBet] = useState('10')
  const [snap, setSnap] = useState<Snap | null>(null)
  const [history, setHistory] = useState<{ key: string; text: string; win: boolean }[]>([])
  const [seedTick, setSeedTick] = useState(0)
  const mirror = useRef<{ snap: Snap | null; at: number }>({ snap: null, at: 0 })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const onSnap = useCallback((s: Snap, kind: 'started' | 'snap' | 'done') => {
    mirror.current = { snap: s, at: performance.now() }
    setSnap(s)
    if (kind === 'done') {
      setSeedTick(x => x + 1)
      const win = s.status === 'cashed'
      setHistory(h => [{ key: `${Date.now()}`, text: `${(win ? s.mult : s.point ?? 1).toFixed(2)}×`, win }, ...h].slice(0, 12))
    }
  }, [])
  const solo = useSolo<Snap>('crash', onSnap)
  const { phase, result, balance, error } = solo

  // draw the live multiplier curve; between snapshots the clock keeps running locally
  useEffect(() => {
    const canvas = canvasRef.current!
    const wrap = wrapRef.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = wrap.clientWidth * dpr
      canvas.height = wrap.clientHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    const col = { grid: cssVar(canvas, '--surface-3'), line: cssVar(canvas, '--accent'), win: cssVar(canvas, '--win'), lose: cssVar(canvas, '--lose'), dim: cssVar(canvas, '--text-mid') }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const { snap: s, at } = mirror.current
      const W = wrap.clientWidth, H = wrap.clientHeight
      ctx.clearRect(0, 0, W, H)
      const t = s ? s.t + (s.status === 'live' ? (now - at) / 1000 : 0) : 0
      const maxT = Math.max(8, t * 1.15)
      const maxM = Math.max(2, crashMultAt(maxT) * 1.05)
      ctx.strokeStyle = col.grid
      ctx.lineWidth = 1
      for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(0, (H / 5) * i); ctx.lineTo(W, (H / 5) * i); ctx.stroke() }
      if (!s) return
      ctx.strokeStyle = s.status === 'dead' ? col.lose : s.status === 'cashed' ? col.win : col.line
      ctx.lineWidth = 4
      ctx.beginPath()
      for (let x = 0; x <= W; x += 4) {
        const tt = (x / W) * maxT
        if (tt > t) break
        const y = H - 24 - ((crashMultAt(tt) - 1) / (maxM - 1)) * (H - 48)
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])

  const live = phase === 'playing' && snap?.status === 'live'
  const amount = num(bet)
  const shown = snap ? (live ? Math.max(snap.mult, crashMultAt(snap.t)) : snap.mult) : 1
  const cashable = live && shown >= 1.01
  const last = phase === 'done' && result ? result : null

  return (
    <div className="dc">
      <div className="dc-top">
        <div className="dc-balance"><span>Balance</span><b>{balance === null ? '—' : balance.toFixed(2)}</b></div>
        <button className="dc-reset" onClick={solo.reset} title="Reset balance"><RotateCcw size={14} /> Reset</button>
      </div>

      <div className="dc-main">
        <div className="dc-controls">
          <BetInput value={bet} onChange={setBet} disabled={phase === 'playing'} />
          {phase === 'playing' ? (
            <button className="dc-roll" onClick={() => solo.act('cash')} disabled={!cashable}>Cash out {cashable ? (amount * shown).toFixed(2) : ''}</button>
          ) : (
            <button className="dc-roll" onClick={() => solo.start(amount, {})} disabled={!(amount > 0) || phase === 'connecting' || (phase === 'offline' && solo.offline !== 'login')}>
              {phase === 'done' ? 'Play again' : 'Start'}
            </button>
          )}
          {last && <p className={last.result === 'cash' ? 'rc-note rc-note--win' : 'dc-error'}>{last.result === 'cash' ? `Cashed out ${last.mult.toFixed(2)}× +${last.payout.toFixed(2)}` : `Crashed at ${(snap?.point ?? 1).toFixed(2)}×`}</p>}
          {error && <p className="dc-error">{error}</p>}
          {phase === 'offline' && solo.offline === 'server' && <p className="dc-error">Cannot reach the game server. Make sure it is running (npm run server).</p>}
          {phase === 'offline' && solo.offline === 'lost' && <p className="dc-error">Connection lost. <button className="gp-link" onClick={solo.reconnect}>Reconnect</button></p>}
          <small className="rc-hint">The multiplier climbs until it crashes at a point fixed when you bet. Cash out before it does.</small>
        </div>

        <div className="dc-board cl-crash" ref={wrapRef}>
          <canvas ref={canvasRef} className="rc-canvas" />
          <div className={`cl-crash-mult${snap?.status === 'dead' ? ' cl-crash-mult--lose' : snap?.status === 'cashed' ? ' cl-crash-mult--win' : ''}`}>
            {shown.toFixed(2)}×
          </div>
        </div>
      </div>

      <History items={history} />
      <FairPanel last={solo.proof} refreshKey={seedTick} />
    </div>
  )
}

export default Crash
