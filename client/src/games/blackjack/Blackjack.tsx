import { useEffect, useState } from 'react'
import { activeRound, roundAction, startRound, type Proof, type RoundReply } from '../classics/api'
import { useClassic, num } from '../classics/useClassic'
import { Frame, BetInput, History } from '../classics/ui'
import FairPanel from '../classics/FairPanel'

type View = {
  player: number[]; playerValue: number; dealer: number[]; dealerValue: number; doubled: boolean; canDouble: boolean
  result?: 'won' | 'lost' | 'refunded'; blackjack?: boolean; bust?: boolean
}
const LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const SUITS = ['♠', '♥', '♦', '♣']
const Card = ({ c }: { c: number }) => {
  const suit = SUITS[Math.floor(c / 13) % 4]
  return <div className={`cl-card${suit === '♥' || suit === '♦' ? ' cl-card--red' : ''}`}><b>{LABELS[c % 13]}</b><span>{suit}</span></div>
}

const Blackjack = () => {
  const c = useClassic()
  const [bet, setBet] = useState('10')
  const [round, setRound] = useState<{ bet: number; view: View } | null>(null)
  const [done, setDone] = useState<RoundReply<View>['done'] | null>(null)
  const [history, setHistory] = useState<{ nonce: number; text: string; win: boolean }[]>([])
  const [proof, setProof] = useState<Proof | null>(null)
  const [seedTick, setSeedTick] = useState(0)

  useEffect(() => {
    if (!c.user) return
    let live = true
    activeRound<View>('blackjack').then(r => { if (live && r.round) { setRound({ bet: r.round.bet, view: r.round.view }); setProof(r.round.proof) } }).catch(() => undefined)
    return () => { live = false }
  }, [c.user])

  const apply = (r: RoundReply<View>) => {
    c.setBalance(r.balance)
    setRound({ bet: r.bet, view: r.view })
    setProof(r.proof)
    if (r.done) {
      setDone(r.done)
      const text = r.done.outcome === 'won' ? (r.view.blackjack ? 'blackjack' : 'win') : r.done.outcome === 'refunded' ? 'push' : 'lose'
      setHistory(h => [{ nonce: r.proof.nonce, text, win: r.done!.outcome === 'won' }, ...h].slice(0, 12))
      setSeedTick(x => x + 1)
    }
  }

  const deal = async () => {
    const r = await c.run(() => startRound<View>('blackjack', { amount: num(bet) }))
    if (!r) return
    setDone(null)
    apply(r)
  }
  const act = async (action: 'hit' | 'stand' | 'double') => {
    const r = await c.run(() => roundAction<View>('blackjack', { action }))
    if (r) apply(r)
  }

  const live = round && !done
  const v = round?.view

  return (
    <Frame
      c={c}
      controls={
        <>
          <BetInput value={bet} onChange={setBet} disabled={!!live || c.busy} />
          {live && v ? (
            <>
              <button className="dc-roll" onClick={() => act('hit')} disabled={c.busy}>Hit</button>
              <button className="dc-roll" onClick={() => act('stand')} disabled={c.busy}>Stand</button>
              <button className="gp-btn" onClick={() => act('double')} disabled={c.busy || !v.canDouble}>Double down</button>
            </>
          ) : (
            <button className="dc-roll" onClick={deal} disabled={c.busy || !(num(bet) > 0)}>{done ? 'Deal again' : 'Deal'}</button>
          )}
          {done && (
            <p className={done.outcome === 'won' ? 'rc-note rc-note--win' : done.outcome === 'refunded' ? 'cl-note' : 'dc-error'}>
              {done.outcome === 'won' ? `You win +${done.payout.toFixed(2)}${v?.blackjack ? ' — blackjack pays 3:2' : ''}` : done.outcome === 'refunded' ? 'Push: your bet is returned' : v?.bust ? 'Bust!' : 'Dealer wins'}
            </p>
          )}
          <small className="rc-hint">6 decks, dealer stands on all 17s, blackjack pays 3:2.</small>
        </>
      }
      board={
        v ? (
          <>
            <div>
              <p className="cl-label">Dealer · {v.dealerValue}{live ? '+' : ''}</p>
              <div className="cl-cards">
                {v.dealer.map((card, i) => <Card key={i} c={card} />)}
                {live && <div className="cl-card cl-card--back" />}
              </div>
            </div>
            <div>
              <p className="cl-label">You · {v.playerValue}{v.doubled ? ' · doubled' : ''}</p>
              <div className="cl-cards">{v.player.map((card, i) => <Card key={i} c={card} />)}</div>
            </div>
          </>
        ) : (
          <p className="cl-note">Place a bet and press Deal.</p>
        )
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

export default Blackjack
