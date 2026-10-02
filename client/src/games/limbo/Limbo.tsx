import { useState } from 'react'
import { instantBet, type Proof } from '../classics/api'
import { useClassic, round2, num } from '../classics/useClassic'
import { Frame, BetInput, History } from '../classics/ui'
import FairPanel from '../classics/FairPanel'
import { LIMBO_MIN, MAX_CRASH } from '../classics/math'

type Details = { result: number; win: boolean; target: number }
type Result = Details & { nonce: number }

const Limbo = () => {
  const c = useClassic()
  const [bet, setBet] = useState('10')
  const [target, setTarget] = useState('2.00')
  const [last, setLast] = useState<Result | null>(null)
  const [history, setHistory] = useState<Result[]>([])
  const [proof, setProof] = useState<Proof | null>(null)
  const [seedTick, setSeedTick] = useState(0)

  const amount = num(bet)
  const t = num(target)
  const valid = t >= LIMBO_MIN && t <= MAX_CRASH
  const chance = valid ? Math.min(99, 99 / t) : 0

  const play = async () => {
    const r = await c.run(() => instantBet<Details>('limbo', { amount, target: t }))
    if (!r) return
    c.setBalance(r.balance)
    const result = { ...r.details, nonce: r.proof.nonce }
    setLast(result)
    setHistory(h => [result, ...h].slice(0, 12))
    setProof(r.proof)
    setSeedTick(x => x + 1)
  }

  return (
    <Frame
      c={c}
      controls={
        <>
          <BetInput value={bet} onChange={setBet} disabled={c.busy} />
          <label className="dc-label">Target multiplier</label>
          <div className="dc-bet">
            <input value={target} onChange={e => setTarget(e.target.value)} inputMode="decimal" aria-label="Target multiplier" />
            <button onClick={() => setTarget('2.00')}>2×</button>
            <button onClick={() => setTarget('10.00')}>10×</button>
          </div>
          <label className="dc-label">Profit on win</label>
          <div className="dc-readonly">{valid ? round2(amount * t - amount).toFixed(2) : '—'}</div>
          <button className="dc-roll" onClick={play} disabled={c.busy || !valid || !(amount > 0)}>{c.busy ? 'Launching…' : 'Place bet'}</button>
        </>
      }
      board={
        <>
          <div className={`dc-result${last ? (last.win ? ' dc-result--win' : ' dc-result--lose') : ''}`}>
            {last ? `${last.result.toFixed(2)}×` : '—'}
          </div>
          <div className="dc-fields">
            <div className="dc-field"><span>Target</span><b>{valid ? `${t.toFixed(2)}×` : '—'}</b></div>
            <div className="dc-field"><span>Win chance</span><b>{valid ? `${chance.toFixed(4)}%` : '—'}</b></div>
            <div className="dc-field"><span>Last result</span><b>{last ? (last.win ? 'Win' : 'Loss') : '—'}</b></div>
          </div>
        </>
      }
      below={
        <>
          <History items={history.map(h => ({ key: String(h.nonce), text: `${h.result.toFixed(2)}×`, win: h.win }))} />
          <FairPanel last={proof} refreshKey={seedTick} />
        </>
      }
    />
  )
}

export default Limbo
