import { useEffect, useRef, useState } from 'react'
import { API_BASE } from '../lib/apiClient'
import { getGame } from '../data/casino'

// Real wins, pushed from the server over Server-Sent Events (server/liveWins.ts)
// whenever a slither round or sports bet actually pays out — no more
// randomly-generated fake wins.
type WinEvent = { id: string; gameId: string | null; label: string; username: string; amount: number; at: string }

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export default function LiveWinsTable() {
  const [wins, setWins] = useState<WinEvent[]>([])
  const [fresh, setFresh] = useState<string | null>(null)
  const sourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    const es = new EventSource(`${API_BASE}/api/events/wins`)
    sourceRef.current = es
    es.onmessage = (msg) => {
      const win = JSON.parse(msg.data) as WinEvent
      setFresh(win.id)
      setWins(prev => [win, ...prev.filter(w => w.id !== win.id)].slice(0, 20))
    }
    return () => es.close()
  }, [])

  return (
    <div className="lwt-strip-wrap">
      <span className="lwt-live-badge">
        <span className="lwt-live-dot" />
        LIVE WINS
      </span>
      {wins.length === 0 ? (
        <p className="lwt-empty">No wins yet — be the first.</p>
      ) : (
        <div className="lwt-strip">
          {wins.map(w => {
            const img = w.gameId ? getGame(w.gameId)?.img : undefined
            return (
              <div key={w.id} className={`lwt-card${w.id === fresh ? ' lwt-card--new' : ''}`}>
                <div
                  className={`lwt-card-img${img ? '' : ' lwt-card-img--fallback'}`}
                  style={img ? { backgroundImage: `url(${img})` } : undefined}
                  title={w.label}
                />
                <span className="lwt-card-player">{w.username}</span>
                <span className="lwt-card-amount">{usd.format(w.amount)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
