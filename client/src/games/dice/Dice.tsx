import { useEffect, useState } from 'react'
import { ShieldCheck, RotateCcw, ChevronDown, ArrowLeftRight } from 'lucide-react'
import { useDemoBalance, round2 } from '../../hooks/useDemoBalance'
import { randomSeed, sha256, rollDice, winChance, multiplier } from './fair'

type Result = { roll: number; win: boolean; nonce: number }

const Dice = () => {
  const { balance, setBalance, reset } = useDemoBalance()

  const [bet, setBet] = useState('10')
  const [over, setOver] = useState(true)
  const [target, setTarget] = useState(50)
  const [rolling, setRolling] = useState(false)
  const [last, setLast] = useState<Result | null>(null)
  const [history, setHistory] = useState<Result[]>([])
  const [error, setError] = useState('')

  const [serverSeed, setServerSeed] = useState(randomSeed)
  const [seedHash, setSeedHash] = useState('')
  const [clientSeed, setClientSeed] = useState(() => randomSeed().slice(0, 16))
  const [nonce, setNonce] = useState(0)
  const [revealed, setRevealed] = useState<{ seed: string; hash: string } | null>(null)
  const [fairOpen, setFairOpen] = useState(false)

  useEffect(() => {
    let live = true
    sha256(serverSeed).then(h => { if (live) setSeedHash(h) })
    return () => { live = false }
  }, [serverSeed])

  const chance = winChance(over, target)
  const mult = multiplier(chance)
  const amount = parseFloat(bet)
  const validBet = amount > 0 && amount <= balance
  const profit = amount > 0 ? round2(amount * mult - amount) : 0

  const play = async () => {
    if (rolling) return
    if (!(amount > 0)) return setError('Enter a bet amount')
    if (amount > balance) return setError('Insufficient balance')
    setError('')
    setRolling(true)
    setBalance(b => b - amount)

    const roll = await rollDice(serverSeed, clientSeed, nonce)
    const win = over ? roll > target : roll < target
    const result = { roll, win, nonce }

    if (win) setBalance(b => b + amount * mult)
    setLast(result)
    setHistory(h => [result, ...h].slice(0, 12))
    setNonce(n => n + 1)
    setRolling(false)
  }

  const rotateSeed = async () => {
    setRevealed({ seed: serverSeed, hash: seedHash })
    setServerSeed(randomSeed())
    setNonce(0)
  }

  const scale = (f: number) => setBet(String(round2(Math.max(0.01, amount * f || 0.01))))

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
            <input
              value={bet}
              onChange={e => setBet(e.target.value)}
              inputMode="decimal"
              aria-label="Bet amount"
            />
            <button onClick={() => scale(0.5)}>½</button>
            <button onClick={() => scale(2)}>2×</button>
          </div>

          <label className="dc-label">Profit on win</label>
          <div className="dc-readonly">{profit.toFixed(2)}</div>

          <button className="dc-roll" onClick={play} disabled={rolling || !validBet}>
            {rolling ? 'Rolling…' : 'Roll dice'}
          </button>
          {error && <p className="dc-error">{error}</p>}
        </div>

        <div className="dc-board">
          <div className={`dc-result${last ? (last.win ? ' dc-result--win' : ' dc-result--lose') : ''}`}>
            {last ? last.roll.toFixed(2) : '—'}
          </div>

          <div className="dc-track-wrap">
            <div className="dc-scale">
              {[0, 25, 50, 75, 100].map(n => <span key={n}>{n}</span>)}
            </div>
            <div
              className={`dc-track${over ? ' dc-track--over' : ''}`}
              style={{ ['--t' as string]: `${target}%` }}
            >
              {last && (
                <span
                  className={`dc-marker${last.win ? ' dc-marker--win' : ' dc-marker--lose'}`}
                  style={{ left: `${last.roll}%` }}
                >
                  {last.roll.toFixed(2)}
                </span>
              )}
              <input
                className="dc-range"
                type="range"
                min={2}
                max={98}
                step={0.01}
                value={target}
                onChange={e => setTarget(parseFloat(e.target.value))}
                aria-label="Target"
              />
            </div>
          </div>

          <div className="dc-fields">
            <div className="dc-field">
              <span>Multiplier</span>
              <b>{mult.toFixed(4)}×</b>
            </div>
            <button className="dc-field dc-field--btn" onClick={() => setOver(o => !o)}>
              <span>Roll {over ? 'over' : 'under'}</span>
              <b>{target.toFixed(2)} <ArrowLeftRight size={14} /></b>
            </button>
            <div className="dc-field">
              <span>Win chance</span>
              <b>{chance.toFixed(2)}%</b>
            </div>
          </div>
        </div>
      </div>

      {history.length > 0 && (
        <div className="dc-history">
          {history.map(h => (
            <span key={h.nonce} className={`dc-chip${h.win ? ' dc-chip--win' : ''}`}>{h.roll.toFixed(2)}</span>
          ))}
        </div>
      )}

      <div className="dc-fair">
        <button className="dc-fair-head" onClick={() => setFairOpen(o => !o)}>
          <ShieldCheck size={16} /> Provably fair
          <ChevronDown size={16} className={fairOpen ? 'gp-chev gp-chev--open' : 'gp-chev'} />
        </button>
        {fairOpen && (
          <div className="dc-fair-body">
            <label>Server seed (hashed)</label>
            <code>{seedHash}</code>
            <label>Client seed</label>
            <input value={clientSeed} onChange={e => { setClientSeed(e.target.value); setNonce(0) }} />
            <label>Nonce</label>
            <code>{nonce}</code>
            <button className="gp-btn" onClick={rotateSeed}>Rotate seed &amp; reveal</button>
            {revealed && (
              <>
                <label>Previous server seed</label>
                <code>{revealed.seed}</code>
                <label>Its SHA-256 hash</label>
                <code>{revealed.hash}</code>
              </>
            )}
            <p>
              Roll = first 4 bytes of HMAC-SHA256(serverSeed, clientSeed:nonce), scaled to 0.00–100.00. Verify a past
              roll by hashing the revealed seed and comparing it to the hash shown before you played.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default Dice
