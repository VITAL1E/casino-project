import { useEffect, useState } from 'react'
import { activeRound, roundAction, startRound, type Proof, type RoundReply } from '../classics/api'
import { useClassic, num } from '../classics/useClassic'
import { Frame, BetInput, History } from '../classics/ui'
import FairPanel from '../classics/FairPanel'

type View = {
  card: number; wins: number; mult: number; higher: number; lower: number; higherMult: number; lowerMult: number
  lost?: boolean; previous?: number; skipped?: boolean
}
const LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const label = (rank: number) => LABELS[rank - 1]

const Card = ({ rank, dim }: { rank: number; dim?: boolean }) => (
  <div className={`cl-card${dim ? ' cl-card--dim' : ''}`}><b>{label(rank)}</b><span>♠</span></div>
)

const HiLo = () => {
  const c = useClassic()
  const [bet, setBet] = useState('10')
  const [round, setRound] = useState<{ bet: number; view: View } | null>(null)
  const [trail, setTrail] = useState<number[]>([])
  const [done, setDone] = useState<RoundReply<View>['done'] | null>(null)
  const [history, setHistory] = useState<{ nonce: number; text: string; win: boolean }[]>([])
  const [proof, setProof] = useState<Proof | null>(null)
  const [seedTick, setSeedTick] = useState(0)

  useEffect(() => {
    if (!c.user) return
    let live = true
    activeRound<View>('hilo').then(r => { if (live && r.round) { setRound({ bet: r.round.bet, view: r.round.view }); setTrail([r.round.view.card]); setProof(r.round.proof) } }).catch(() => undefined)
    return () => { live = false }
  }, [c.user])

  const apply = (r: RoundReply<View>, fresh = false) => {
    c.setBalance(r.balance)
    setRound({ bet: r.bet, view: r.view })
    setTrail(t => (fresh ? [r.view.card] : [...t, r.view.card].slice(-8)))
    setProof(r.proof)
    if (r.done) {
      setDone(r.done)
      setHistory(h => [{ nonce: r.proof.nonce, text: r.done!.outcome === 'won' ? `${r.done!.mult}×` : 'lost', win: r.done!.outcome === 'won' }, ...h].slice(0, 12))
      setSeedTick(x => x + 1)
    }
  }

  const start = async () => {
    const r = await c.run(() => startRound<View>('hilo', { amount: num(bet) }))
    if (!r) return
    setDone(null)
    apply(r, true)
  }
  const act = async (action: 'higher' | 'lower' | 'skip' | 'cashout') => {
    const r = await c.run(() => roundAction<View>('hilo', { action }))
    if (r) apply(r)
  }

  const live = round && !done
  const v = round?.view
  const payout = v && round ? Math.round(round.bet * v.mult * 100) / 100 : 0

  return (
    <Frame
      c={c}
      controls={
        <>
          <BetInput value={bet} onChange={setBet} disabled={!!live || c.busy} />
          {live && v ? (
            <>
              <button className="dc-roll" onClick={() => act('higher')} disabled={c.busy}>Higher or same · {v.higherMult}×</button>
              <button className="dc-roll" onClick={() => act('lower')} disabled={c.busy}>Lower or same · {v.lowerMult}×</button>
              <button className="gp-btn" onClick={() => act('skip')} disabled={c.busy}>Skip card</button>
              <button className="rc-cash" onClick={() => act('cashout')} disabled={c.busy || v.wins < 1}>Cash out {v.wins ? payout.toFixed(2) : ''}</button>
            </>
          ) : (
            <button className="dc-roll" onClick={start} disabled={c.busy || !(num(bet) > 0)}>{done ? 'Play again' : 'Start game'}</button>
          )}
          {done && <p className={done.outcome === 'won' ? 'rc-note rc-note--win' : 'dc-error'}>{done.outcome === 'won' ? `Cashed out +${done.payout.toFixed(2)}` : 'Wrong guess.'}</p>}
        </>
      }
      board={
        <>
          <div className="cl-cards">
            {trail.slice(0, -1).map((r, i) => <Card key={i} rank={r} dim />)}
            {v ? <Card rank={v.card} /> : <div className="cl-card cl-card--empty">?</div>}
          </div>
          {v && (
            <div className="dc-fields">
              <div className="dc-field"><span>Higher or same</span><b>{(v.higher * 100).toFixed(1)}%</b></div>
              <div className="dc-field"><span>Multiplier</span><b>{v.mult.toFixed(4)}×</b></div>
              <div className="dc-field"><span>Lower or same</span><b>{(v.lower * 100).toFixed(1)}%</b></div>
            </div>
          )}
          {!v && <p className="cl-note">Guess whether the next card is higher or lower. A tie counts as a win.</p>}
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

export default HiLo
