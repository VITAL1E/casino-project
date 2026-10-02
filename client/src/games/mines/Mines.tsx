import { useEffect, useState } from 'react'
import { activeRound, roundAction, startRound, type Proof, type RoundReply } from '../classics/api'
import { useClassic, num } from '../classics/useClassic'
import { Frame, BetInput, History } from '../classics/ui'
import FairPanel from '../classics/FairPanel'
import { MINES_TILES, minesMult } from '../classics/math'

type View = { revealed: number[]; mines: number; mult: number; nextMult: number | null; bombs?: number[]; hit?: number }

const Mines = () => {
  const c = useClassic()
  const [bet, setBet] = useState('10')
  const [mines, setMines] = useState(3)
  const [round, setRound] = useState<{ id: string; bet: number; view: View } | null>(null)
  const [done, setDone] = useState<RoundReply<View>['done'] | null>(null)
  const [history, setHistory] = useState<{ nonce: number; text: string; win: boolean }[]>([])
  const [proof, setProof] = useState<Proof | null>(null)
  const [seedTick, setSeedTick] = useState(0)

  // pick up a round that was in progress (page reload, server restart)
  useEffect(() => {
    if (!c.user) return
    let live = true
    activeRound<View>('mines').then(r => { if (live && r.round) { setRound({ id: r.round.roundId, bet: r.round.bet, view: r.round.view }); setProof(r.round.proof) } }).catch(() => undefined)
    return () => { live = false }
  }, [c.user])

  const apply = (r: RoundReply<View>) => {
    c.setBalance(r.balance)
    setRound({ id: r.roundId, bet: r.bet, view: r.view })
    setProof(r.proof)
    if (r.done) {
      setDone(r.done)
      setHistory(h => [{ nonce: r.proof.nonce, text: r.done!.outcome === 'won' ? `${r.done!.mult}×` : 'bust', win: r.done!.outcome === 'won' }, ...h].slice(0, 12))
      setSeedTick(x => x + 1)
    }
  }

  const start = async () => {
    const r = await c.run(() => startRound<View>('mines', { amount: num(bet), mines }))
    if (!r) return
    setDone(null)
    apply(r)
  }
  const reveal = async (tile: number) => {
    if (!round || done || round.view.revealed.includes(tile)) return
    const r = await c.run(() => roundAction<View>('mines', { action: 'reveal', tile }))
    if (r) apply(r)
  }
  const cashout = async () => {
    const r = await c.run(() => roundAction<View>('mines', { action: 'cashout' }))
    if (r) apply(r)
  }

  const live = round && !done
  const view = round?.view
  const payout = view && round ? Math.round(round.bet * view.mult * 100) / 100 : 0

  return (
    <Frame
      c={c}
      controls={
        <>
          <BetInput value={bet} onChange={setBet} disabled={!!live || c.busy} />
          <label className="dc-label">Mines: {live && view ? view.mines : mines}</label>
          <input type="range" aria-label="Number of mines" min={1} max={MINES_TILES - 1} value={live && view ? view.mines : mines} disabled={!!live || c.busy} onChange={e => setMines(Number(e.target.value))} />
          {live && view ? (
            <>
              <button className="dc-roll" onClick={cashout} disabled={c.busy || view.revealed.length === 0}>
                Cash out {view.revealed.length ? payout.toFixed(2) : ''}
              </button>
              <small className="rc-hint">Next tile: {view.nextMult ? `${view.nextMult}×` : '—'}</small>
            </>
          ) : (
            <button className="dc-roll" onClick={start} disabled={c.busy || !(num(bet) > 0)}>{done ? 'Play again' : 'Start game'}</button>
          )}
          {done && <p className={done.outcome === 'won' ? 'rc-note rc-note--win' : 'dc-error'}>{done.outcome === 'won' ? `Cashed out +${done.payout.toFixed(2)}` : 'Boom! You hit a mine.'}</p>}
        </>
      }
      board={
        <>
          <div className="cl-mgrid">
            {Array.from({ length: MINES_TILES }, (_, i) => {
              const open = view?.revealed.includes(i)
              const bomb = view?.bombs?.includes(i)
              return (
                <button
                  key={i}
                  className={`cl-mtile${open && !bomb ? ' cl-mtile--gem' : ''}${bomb ? ' cl-mtile--bomb' : ''}${view?.hit === i ? ' cl-mtile--hit' : ''}`}
                  disabled={!live || c.busy || !!open}
                  aria-label={bomb ? `Tile ${i + 1}: mine` : open ? `Tile ${i + 1}: safe` : `Tile ${i + 1}`}
                  onClick={() => reveal(i)}
                >
                  {bomb ? '💣' : open ? '💎' : ''}
                </button>
              )
            })}
          </div>
          {view && <p className="cl-note">Multiplier {view.mult.toFixed(4)}× · {view.revealed.filter(t => !view.bombs?.includes(t)).length} safe tiles found</p>}
          {!view && <p className="cl-note">Next safe tile pays {minesMult(mines, 1)}×</p>}
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

export default Mines
