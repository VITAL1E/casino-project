import type { ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'
import { round2, useClassic } from './useClassic'

type Classic = ReturnType<typeof useClassic>

// Page layout every classic game uses: balance bar, controls on the left, the board on the right.
export const Frame = ({ c, controls, board, below }: { c: Classic; controls: ReactNode; board: ReactNode; below?: ReactNode }) => (
  <div className="dc">
    <div className="dc-top">
      <div className="dc-balance">
        <span>Balance</span>
        <b>{c.balance === null ? '—' : c.balance.toFixed(2)}</b>
      </div>
      <button className="dc-reset" onClick={c.reset} title="Reset balance">
        <RotateCcw size={14} /> Reset
      </button>
    </div>
    <div className="dc-main">
      <div className="dc-controls">{controls}{c.error && <p className="dc-error">{c.error}</p>}</div>
      <div className="dc-board">{board}</div>
    </div>
    {below}
  </div>
)

export const BetInput = ({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) => {
  const amount = parseFloat(value)
  const scale = (f: number) => onChange(String(round2(Math.max(0.01, (amount || 0.01) * f))))
  return (
    <>
      <label className="dc-label">Bet amount</label>
      <div className="dc-bet">
        <input value={value} onChange={e => onChange(e.target.value)} inputMode="decimal" aria-label="Bet amount" disabled={disabled} />
        <button disabled={disabled} onClick={() => scale(0.5)}>½</button>
        <button disabled={disabled} onClick={() => scale(2)}>2×</button>
      </div>
    </>
  )
}

export const Chips = <T extends string | number>({ options, value, onChange, disabled, label }: {
  options: readonly T[]; value: T; onChange: (v: T) => void; disabled?: boolean; label?: (v: T) => string
}) => (
  <div className="rc-chips">
    {options.map(o => (
      <button key={String(o)} disabled={disabled} className={`rc-chip${o === value ? ' rc-chip--on' : ''}`} onClick={() => onChange(o)}>
        {label ? label(o) : String(o)}
      </button>
    ))}
  </div>
)

export const History = ({ items }: { items: { key: string; text: string; win: boolean }[] }) =>
  items.length ? (
    <div className="dc-history">
      {items.map(h => <span key={h.key} className={`dc-chip${h.win ? ' dc-chip--win' : ''}`}>{h.text}</span>)}
    </div>
  ) : null

