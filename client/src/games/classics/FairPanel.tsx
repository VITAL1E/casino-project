// "Provably fair" panel shared by every classic game: shows the committed server-seed hash, lets the player pick
// their client seed, rotate (reveal) the server seed, and verify the random numbers of a past bet in the browser.
import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck, ChevronDown } from 'lucide-react'
import { getFair, rotateSeed, setClientSeed, type Fair, type Proof } from './api'
import { useAuth } from '../../lib/auth/context'
import { ApiError } from '../../lib/apiClient'

import { floatsFor, sha256 } from './fairMath'

type Props = { last?: Proof | null; refreshKey?: number }

const FairPanel = ({ last, refreshKey = 0 }: Props) => {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [fair, setFair] = useState<Fair | null>(null)
  const [seed, setSeed] = useState('')
  const [msg, setMsg] = useState('')
  const [verified, setVerified] = useState<{ ok: boolean; floats: number[] } | null>(null)

  const apply = useCallback((f: Fair) => { setFair(f); setSeed(f.clientSeed) }, [])
  useEffect(() => {
    if (!open || !user) return
    let live = true
    getFair().then(f => { if (live) apply(f) }).catch(() => { /* not logged in */ })
    return () => { live = false }
  }, [open, user, refreshKey, apply])

  const fail = (e: unknown) => setMsg(e instanceof ApiError ? e.message : 'Something went wrong')

  const saveSeed = async () => { try { await setClientSeed(seed); setMsg('Client seed saved, nonce reset'); apply(await getFair()) } catch (e) { fail(e) } }
  const rotate = async () => { try { await rotateSeed(); setMsg('Server seed revealed and replaced'); setVerified(null); apply(await getFair()) } catch (e) { fail(e) } }

  const verify = async () => {
    if (!fair?.previous || !last) return
    const p = fair.previous
    const ok = (await sha256(p.serverSeed)) === last.serverSeedHash && p.clientSeed === last.clientSeed
    setVerified({ ok, floats: await floatsFor(p.serverSeed, last.clientSeed, last.nonce) })
  }

  return (
    <div className="dc-fair">
      <button className="dc-fair-head" onClick={() => setOpen(o => !o)}>
        <ShieldCheck size={16} /> Provably fair
        <ChevronDown size={16} className={open ? 'gp-chev gp-chev--open' : 'gp-chev'} />
      </button>
      {open && (
        <div className="dc-fair-body">
          {!user && <p>Log in to see your seeds.</p>}
          {fair && (
            <>
              <label>Server seed (hashed, committed before you bet)</label>
              <code>{fair.serverSeedHash}</code>
              <label>Client seed</label>
              <input value={seed} onChange={e => setSeed(e.target.value)} maxLength={64} />
              <button className="gp-btn" onClick={saveSeed} disabled={seed === fair.clientSeed}>Use this client seed</button>
              <label>Nonce (bets made with this seed pair)</label>
              <code>{fair.nonce}</code>
              <button className="gp-btn" onClick={rotate}>Rotate seed &amp; reveal</button>
              {fair.previous && (
                <>
                  <label>Previous server seed (revealed)</label>
                  <code>{fair.previous.serverSeed}</code>
                  <label>Its SHA-256 hash</label>
                  <code>{fair.previous.serverSeedHash}</code>
                  {last && last.serverSeedHash === fair.previous.serverSeedHash && (
                    <button className="gp-btn" onClick={verify}>Verify my last bet (nonce {last.nonce})</button>
                  )}
                </>
              )}
              {verified && (
                <>
                  <label>{verified.ok ? 'Seed matches the hash you saw before betting.' : 'Seed does NOT match.'} First random numbers of that bet:</label>
                  <code>{verified.floats.slice(0, 4).map(f => f.toFixed(8)).join('  ')}</code>
                </>
              )}
            </>
          )}
          {msg && <p>{msg}</p>}
          <p>
            Every number comes from HMAC-SHA256(serverSeed, clientSeed:nonce:round), turned into a value from 0 to 1. The server only shows
            the hash of its seed while you play, so it cannot change an outcome after seeing your bet. Rotate the seed to reveal it, then
            recompute any bet made with it (Dice roll = floor(first number × 10001) / 100).
          </p>
        </div>
      )}
    </div>
  )
}

export default FairPanel
