import { useEffect, useState } from 'react'
import { instantBet, type Proof } from '../classics/api'
import { useClassic, num } from '../classics/useClassic'
import { Frame, BetInput, Chips, History } from '../classics/ui'
import FairPanel from '../classics/FairPanel'
import { KENO_MAX_PICKS, KENO_NUMBERS, KENO_RISK, kenoTable, type KenoRisk } from '../classics/math'

type Details = { drawn: number[]; hits: number[]; mult: number }

const Keno = () => {
  const c = useClassic()
  const [bet, setBet] = useState('10')
  const [risk, setRisk] = useState<KenoRisk>('medium')
  const [picks, setPicks] = useState<number[]>([])
  const [shown, setShown] = useState<number[]>([])          // drawn numbers revealed so far (animation)
  const [outcome, setOutcome] = useState<(Details & { payout: number; nonce: number }) | null>(null)
  const [history, setHistory] = useState<{ nonce: number; text: string; win: boolean }[]>([])
  const [proof, setProof] = useState<Proof | null>(null)
  const [seedTick, setSeedTick] = useState(0)
  const [revealing, setRevealing] = useState(false)

  const amount = num(bet)
  const table = picks.length ? kenoTable(picks.length, risk) : []

  const toggle = (n: number) => {
    if (c.busy || revealing) return
    setOutcome(null); setShown([])
    setPicks(p => (p.includes(n) ? p.filter(x => x !== n) : p.length < KENO_MAX_PICKS ? [...p, n] : p))
  }

  const play = async () => {
    const r = await c.run(() => instantBet<Details>('keno', { amount, picks, risk }))
    if (!r) return
    setOutcome(null); setShown([]); setRevealing(true)
    const { drawn } = r.details
    // reveal the drawn numbers one after another, then show the result
    drawn.forEach((n, i) => setTimeout(() => setShown(s => [...s, n]), 120 * (i + 1)))
    setTimeout(() => {
      setOutcome({ ...r.details, payout: r.payout, nonce: r.proof.nonce })
      c.setBalance(r.balance)
      setHistory(h => [{ nonce: r.proof.nonce, text: `${r.details.hits.length} hit${r.details.hits.length === 1 ? '' : 's'} · ${r.details.mult}×`, win: r.payout > r.stake }, ...h].slice(0, 12))
      setProof(r.proof)
      setSeedTick(x => x + 1)
      setRevealing(false)
    }, 120 * (drawn.length + 1))
  }

  useEffect(() => () => { /* timers end on their own; state setters are safe after unmount */ }, [])

  return (
    <Frame
      c={c}
      controls={
        <>
          <BetInput value={bet} onChange={setBet} disabled={c.busy || revealing} />
          <label className="dc-label">Risk</label>
          <Chips options={KENO_RISK} value={risk} onChange={setRisk} disabled={c.busy || revealing} />
          <button className="dc-roll" onClick={play} disabled={c.busy || revealing || picks.length === 0 || !(amount > 0)}>
            {c.busy || revealing ? 'Drawing…' : 'Play'}
          </button>
          <button className="gp-btn" disabled={c.busy || revealing || picks.length === 0} onClick={() => { setPicks([]); setOutcome(null); setShown([]) }}>Clear picks</button>
          <small className="rc-hint">Pick 1-{KENO_MAX_PICKS} numbers. 10 of {KENO_NUMBERS} are drawn.</small>
        </>
      }
      board={
        <>
          <div className="cl-kgrid">
            {Array.from({ length: KENO_NUMBERS }, (_, i) => i + 1).map(n => {
              const picked = picks.includes(n)
              const drawn = shown.includes(n)
              return (
                <button key={n} className={`cl-kcell${picked ? ' cl-kcell--pick' : ''}${drawn ? (picked ? ' cl-kcell--hit' : ' cl-kcell--drawn') : ''}`} onClick={() => toggle(n)}>
                  {n}
                </button>
              )
            })}
          </div>
          {outcome && (
            <p className="cl-note">
              {outcome.hits.length} hit{outcome.hits.length === 1 ? '' : 's'} · {outcome.mult}× · {outcome.payout > 0 ? `+${outcome.payout.toFixed(2)}` : 'no payout'}
            </p>
          )}
          {table.length > 0 && (
            <div className="cl-paytable">
              {table.map((m, h) => (
                <div key={h} className={`cl-pay${outcome && outcome.hits.length === h ? ' cl-pay--on' : ''}`}><span>{h}</span><b>{m}×</b></div>
              ))}
            </div>
          )}
        </>
      }
      below={
        <>
          <History items={history.map(h => ({ key: String(h.nonce), text: h.text, win: h.win }))} />
          <FairPanel last={proof} refreshKey={seedTick} />
        </>
      }
    />
  )
}

export default Keno
