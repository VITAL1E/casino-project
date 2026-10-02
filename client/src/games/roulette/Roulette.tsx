import { useState } from 'react'
import { instantBet, type Proof } from '../classics/api'
import { useClassic, round2, num } from '../classics/useClassic'
import { Frame, History } from '../classics/ui'
import FairPanel from '../classics/FairPanel'
import { RED, rouletteReturn, type RouletteBet } from '../classics/math'

type Placed = RouletteBet & { amount: number }
type Details = { number: number; color: 'red' | 'black' | 'green'; wins: boolean[] }

const keyOf = (b: RouletteBet) => ('value' in b ? `${b.type}:${b.value}` : b.type)
const colorOf = (n: number) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black')

// 3 rows x 12 columns like a real table: the top row holds 3, 6, 9 ... 36
const ROWS = [0, 1, 2].map(r => Array.from({ length: 12 }, (_, i) => i * 3 + (3 - r)))

const OUTSIDE: { label: string; bet: RouletteBet }[] = [
  { label: '1st 12', bet: { type: 'dozen', value: 0 } },
  { label: '2nd 12', bet: { type: 'dozen', value: 1 } },
  { label: '3rd 12', bet: { type: 'dozen', value: 2 } },
  { label: '1-18', bet: { type: 'low' } },
  { label: 'Even', bet: { type: 'even' } },
  { label: 'Red', bet: { type: 'red' } },
  { label: 'Black', bet: { type: 'black' } },
  { label: 'Odd', bet: { type: 'odd' } },
  { label: '19-36', bet: { type: 'high' } },
]

const Roulette = () => {
  const c = useClassic()
  const [chip, setChip] = useState('5')
  const [placed, setPlaced] = useState<Placed[]>([])
  const [last, setLast] = useState<{ number: number; color: string; won: number; stake: number; nonce: number } | null>(null)
  const [history, setHistory] = useState<{ number: number; nonce: number; win: boolean }[]>([])
  const [proof, setProof] = useState<Proof | null>(null)
  const [seedTick, setSeedTick] = useState(0)

  const total = round2(placed.reduce((s, b) => s + b.amount, 0))
  const stakeOn = (b: RouletteBet) => placed.find(p => keyOf(p) === keyOf(b))?.amount ?? 0

  const add = (b: RouletteBet) => {
    const amount = round2(num(chip))
    if (!(amount > 0)) return
    setPlaced(list => {
      const i = list.findIndex(p => keyOf(p) === keyOf(b))
      if (i < 0) return [...list, { ...b, amount }]
      return list.map((p, j) => (j === i ? { ...p, amount: round2(p.amount + amount) } : p))
    })
  }

  const spin = async () => {
    const r = await c.run(() => instantBet<Details>('roulette', { bets: placed }))
    if (!r) return
    c.setBalance(r.balance)
    const res = { number: r.details.number, color: r.details.color, won: r.payout, stake: r.stake, nonce: r.proof.nonce }
    setLast(res)
    setHistory(h => [{ number: res.number, nonce: res.nonce, win: r.payout > r.stake }, ...h].slice(0, 14))
    setProof(r.proof)
    setSeedTick(x => x + 1)
  }

  const cell = (b: RouletteBet, label: string, cls: string) => (
    <button key={keyOf(b)} className={`cl-rcell ${cls}${last && 'number' in last && b.type === 'straight' && b.value === last.number ? ' cl-rcell--hit' : ''}`} onClick={() => add(b)}>
      {label}
      {stakeOn(b) > 0 && <i>{stakeOn(b)}</i>}
    </button>
  )

  return (
    <Frame
      c={c}
      controls={
        <>
          <label className="dc-label">Chip value</label>
          <div className="dc-bet">
            <input value={chip} onChange={e => setChip(e.target.value)} inputMode="decimal" aria-label="Chip value" />
            {[1, 5, 25].map(v => <button key={v} onClick={() => setChip(String(v))}>{v}</button>)}
          </div>
          <label className="dc-label">Total bet</label>
          <div className="dc-readonly">{total.toFixed(2)}</div>
          <button className="dc-roll" onClick={spin} disabled={c.busy || placed.length === 0}>{c.busy ? 'Spinning…' : 'Spin'}</button>
          <button className="gp-btn" onClick={() => setPlaced([])} disabled={c.busy || placed.length === 0}>Clear bets</button>
          <small className="rc-hint">Click a number or a box to add a chip. Straight pays 35:1, dozens 2:1, even-money bets 1:1.</small>
        </>
      }
      board={
        <>
          <div className={`dc-result${last ? (last.won > last.stake ? ' dc-result--win' : last.won > 0 ? '' : ' dc-result--lose') : ''}`}>
            {last ? last.number : '—'}
          </div>
          {last && <p className="cl-note">{last.won > 0 ? `Returned ${last.won.toFixed(2)} on ${last.stake.toFixed(2)} staked` : `Lost ${last.stake.toFixed(2)}`} · {last.color}</p>}
          <div className="cl-rtable">
            {cell({ type: 'straight', value: 0 }, '0', 'cl-rcell--green cl-rzero')}
            <div className="cl-rnums">
              {ROWS.map((row, r) => (
                <div key={r} className="cl-rrow">
                  {row.map(n => cell({ type: 'straight', value: n }, String(n), colorOf(n) === 'red' ? 'cl-rcell--red' : 'cl-rcell--black'))}
                  {cell({ type: 'column', value: 2 - r }, '2:1', 'cl-rcell--out')}
                </div>
              ))}
            </div>
          </div>
          <div className="cl-rout">
            {OUTSIDE.map(o => cell(o.bet, o.label, o.bet.type === 'red' ? 'cl-rcell--red' : o.bet.type === 'black' ? 'cl-rcell--black' : 'cl-rcell--out'))}
          </div>
          <small className="rc-hint">Each straight-up chip returns {rouletteReturn({ type: 'straight', value: 0 })}× including the stake. House edge 2.7% (single zero).</small>
        </>
      }
      below={
        <>
          <History items={history.map(h => ({ key: String(h.nonce), text: String(h.number), win: h.win }))} />
          <FairPanel last={proof} refreshKey={seedTick} />
        </>
      }
    />
  )
}

export default Roulette
