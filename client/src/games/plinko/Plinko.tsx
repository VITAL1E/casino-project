import { useEffect, useRef, useState } from 'react'
import { instantBet, type Proof } from '../classics/api'
import { useClassic, num } from '../classics/useClassic'
import { Frame, BetInput, Chips, History } from '../classics/ui'
import FairPanel from '../classics/FairPanel'
import { PLINKO_RISK, PLINKO_ROWS, plinkoTable, type PlinkoRisk } from '../classics/math'

type Details = { path: number[]; slot: number; mult: number; rows: number; risk: PlinkoRisk }
const W = 440, H = 400, TOP = 24, STEP_MS = 140

const Plinko = () => {
  const c = useClassic()
  const [bet, setBet] = useState('10')
  const [rows, setRows] = useState<number>(12)
  const [risk, setRisk] = useState<PlinkoRisk>('medium')
  const [ball, setBall] = useState<{ x: number; y: number } | null>(null)
  const [landed, setLanded] = useState<number | null>(null)
  const [dropping, setDropping] = useState(false)
  const [history, setHistory] = useState<{ nonce: number; mult: number; win: boolean }[]>([])
  const [proof, setProof] = useState<Proof | null>(null)
  const [seedTick, setSeedTick] = useState(0)
  const timers = useRef<number[]>([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const dx = (W - 40) / (rows + 1)
  const dy = (H - TOP - 50) / rows
  const px = (k: number, j: number) => W / 2 + (j - k / 2) * dx   // position after k decisions with j "rights"
  const py = (k: number) => TOP + k * dy
  const table = plinkoTable(rows, risk)
  const amount = num(bet)

  const drop = async () => {
    const r = await c.run(() => instantBet<Details>('plinko', { amount, rows, risk }))
    if (!r) return
    timers.current.forEach(clearTimeout)
    timers.current = []
    setDropping(true); setLanded(null)
    const { path } = r.details
    let rights = 0
    setBall({ x: px(0, 0), y: py(0) - 14 })
    path.forEach((bit, i) => {
      rights += bit
      const j = rights
      timers.current.push(window.setTimeout(() => setBall({ x: px(i + 1, j), y: py(i + 1) }), STEP_MS * (i + 1)))
    })
    timers.current.push(window.setTimeout(() => {
      setLanded(r.details.slot)
      setBall(b => (b ? { ...b, y: b.y + 24 } : b))
      c.setBalance(r.balance)
      setHistory(h => [{ nonce: r.proof.nonce, mult: r.details.mult, win: r.payout > r.stake }, ...h].slice(0, 12))
      setProof(r.proof)
      setSeedTick(x => x + 1)
      setDropping(false)
    }, STEP_MS * (path.length + 1)))
  }

  return (
    <Frame
      c={c}
      controls={
        <>
          <BetInput value={bet} onChange={setBet} disabled={c.busy || dropping} />
          <label className="dc-label">Rows</label>
          <Chips options={PLINKO_ROWS} value={rows as (typeof PLINKO_ROWS)[number]} onChange={setRows} disabled={c.busy || dropping} />
          <label className="dc-label">Risk</label>
          <Chips options={PLINKO_RISK} value={risk} onChange={setRisk} disabled={c.busy || dropping} />
          <button className="dc-roll" onClick={drop} disabled={c.busy || dropping || !(amount > 0)}>{c.busy || dropping ? 'Dropping…' : 'Drop ball'}</button>
        </>
      }
      board={
        <svg className="cl-plinko" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Plinko board">
          {Array.from({ length: rows }, (_, k) =>
            Array.from({ length: k + 1 }, (_, j) => <circle key={`${k}-${j}`} cx={px(k, j)} cy={py(k)} r={3} className="cl-peg" />))}
          {table.map((m, i) => (
            <g key={i} className={`cl-slot${landed === i ? ' cl-slot--on' : ''}`}>
              <rect x={px(rows, i) - dx / 2 + 2} y={H - 38} width={dx - 4} height={26} rx={5} className={m >= 1 ? 'cl-slot-win' : 'cl-slot-lose'} />
              <text x={px(rows, i)} y={H - 20} textAnchor="middle">{m >= 100 ? Math.round(m) : m}</text>
            </g>
          ))}
          {ball && <circle cx={ball.x} cy={ball.y} r={7} className="cl-ball" />}
        </svg>
      }
      below={
        <>
          <History items={history.map(h => ({ key: String(h.nonce), text: `${h.mult}×`, win: h.win }))} />
          <FairPanel last={proof} refreshKey={seedTick} />
        </>
      }
    />
  )
}

export default Plinko
