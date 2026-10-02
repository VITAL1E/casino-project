import { useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { instantBet, type Proof } from '../classics/api'
import { useClassic, round2, num } from '../classics/useClassic'
import { Frame, BetInput, History } from '../classics/ui'
import FairPanel from '../classics/FairPanel'
import { diceChance, diceMult, DICE_MAX, DICE_MIN } from '../classics/math'

type Details = { roll: number; win: boolean; mult: number }
type Result = Details & { nonce: number }

const Dice = () => {
  const c = useClassic()
  const [bet, setBet] = useState('10')
  const [over, setOver] = useState(true)
  const [target, setTarget] = useState(50)
  const [last, setLast] = useState<Result | null>(null)
  const [history, setHistory] = useState<Result[]>([])
  const [proof, setProof] = useState<Proof | null>(null)
  const [seedTick, setSeedTick] = useState(0)

  const chance = diceChance(over, target)
  const mult = diceMult(chance)
  const amount = num(bet)
  const profit = amount > 0 ? round2(amount * mult - amount) : 0

  const play = async () => {
    const r = await c.run(() => instantBet<Details>('dice', { amount, over, target }))
    if (!r) return
    c.setBalance(r.balance)
    const result = { ...r.details, nonce: r.proof.nonce }
    setLast(result)
    setHistory(h => [result, ...h].slice(0, 12))
    setProof(r.proof)
    setSeedTick(t => t + 1)
  }

  return (
    <Frame
      c={c}
      controls={
        <>
          <BetInput value={bet} onChange={setBet} disabled={c.busy} />
          <label className="dc-label">Profit on win</label>
          <div className="dc-readonly">{profit.toFixed(2)}</div>
          <button className="dc-roll" onClick={play} disabled={c.busy || !(amount > 0)}>{c.busy ? 'Rolling…' : 'Roll dice'}</button>
        </>
      }
      board={
        <>
          <div className={`dc-result${last ? (last.win ? ' dc-result--win' : ' dc-result--lose') : ''}`}>
            {last ? last.roll.toFixed(2) : '—'}
          </div>

          <div className="dc-track-wrap">
            <div className="dc-scale">{[0, 25, 50, 75, 100].map(n => <span key={n}>{n}</span>)}</div>
            <div className={`dc-track${over ? ' dc-track--over' : ''}`} style={{ ['--t' as string]: `${target}%` }}>
              {last && (
                <span className={`dc-marker${last.win ? ' dc-marker--win' : ' dc-marker--lose'}`} style={{ left: `${last.roll}%` }}>
                  {last.roll.toFixed(2)}
                </span>
              )}
              <input
                className="dc-range" type="range" min={DICE_MIN} max={DICE_MAX} step={0.01} value={target}
                onChange={e => setTarget(parseFloat(e.target.value))} aria-label="Target"
              />
            </div>
          </div>

          <div className="dc-fields">
            <div className="dc-field"><span>Multiplier</span><b>{mult.toFixed(4)}×</b></div>
            <button className="dc-field dc-field--btn" onClick={() => setOver(o => !o)}>
              <span>Roll {over ? 'over' : 'under'}</span>
              <b>{target.toFixed(2)} <ArrowLeftRight size={14} /></b>
            </button>
            <div className="dc-field"><span>Win chance</span><b>{chance.toFixed(2)}%</b></div>
          </div>
        </>
      }
      below={
        <>
          <History items={history.map(h => ({ key: String(h.nonce), text: h.roll.toFixed(2), win: h.win }))} />
          <FairPanel last={proof} refreshKey={seedTick} />
        </>
      }
    />
  )
}

export default Dice
