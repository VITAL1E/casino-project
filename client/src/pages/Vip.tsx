import { useCallback, useEffect, useState } from 'react'
import PageShell from '../components/PageShell'
import { seoFor } from '../lib/seoFor'
import { useAuth } from '../lib/auth/context'
import { ApiError } from '../lib/apiClient'
import { claimVip, getRewardsInfo, getVip, type Tier, type Vip as VipState } from '../lib/rewardsApi'

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })

const Vip = () => {
  const { user, openAuth } = useAuth()
  const [tiers, setTiers] = useState<Tier[]>([])
  const [vip, setVip] = useState<VipState | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let live = true
    getRewardsInfo().then(i => { if (live) setTiers(i.tiers) }).catch(() => undefined)
    return () => { live = false }
  }, [])

  useEffect(() => {
    let live = true
    if (user) getVip().then(v => { if (live) setVip(v) }).catch(() => undefined)
    return () => { live = false }
  }, [user])

  const claim = useCallback(async () => {
    try {
      const r = await claimVip()
      setMsg(r.credited > 0 ? `+${fmt(r.credited)} credits added to your balance` : 'Nothing to claim yet')
      setVip(await getVip())
    } catch (e) { setMsg(e instanceof ApiError ? e.message : 'Could not claim') }
  }, [])

  const rows = vip?.tiers ?? tiers.map(t => ({ ...t, reached: false, claimed: false }))
  const progress = vip?.next ? Math.min(100, ((vip.wagered - (rows.find(t => t.key === vip.level.key)?.min ?? 0)) / (vip.next.min - (rows.find(t => t.key === vip.level.key)?.min ?? 0))) * 100) : 100

  return (
    <PageShell {...seoFor('/vip')} h1="VIP Club" crumbs={[{ label: 'VIP' }]}
      intro="Your level goes up with everything you wager. Each new level pays a one-time bonus in play credits.">
      {user && vip ? (
        <div className="cp-card">
          <span className="cp-tag">Your level</span>
          <h2>{vip.level.name}</h2>
          <p>{fmt(vip.wagered)} credits wagered{vip.next ? ` · ${fmt(vip.next.remaining)} more to reach ${vip.next.name}` : ' · top level reached'}</p>
          <div className="cp-bar"><i style={{ width: `${progress}%` }} /></div>
          {vip.claimable > 0 && <button className="btn-primary cp-btn" onClick={claim}>Claim {fmt(vip.claimable)} credits</button>}
          {msg && <p>{msg}</p>}
        </div>
      ) : (
        <div className="cp-card">
          <h2>Track your level</h2>
          <p>Log in to see your level, your progress and to claim level-up bonuses.</p>
          <button className="btn-primary cp-btn" onClick={() => openAuth('login')}>Log in</button>
        </div>
      )}

      <table className="cp-table">
        <thead><tr><th>Level</th><th>Wager needed</th><th>Level-up bonus</th><th><span className="sr-only">Status</span></th></tr></thead>
        <tbody>
          {rows.map(t => (
            <tr key={t.key}>
              <td>{t.name}</td>
              <td>{t.min === 0 ? 'Sign up' : fmt(t.min)}</td>
              <td>{t.reward ? `${fmt(t.reward)} credits` : '—'}</td>
              <td>{vip ? (t.reward === 0 ? '' : t.claimed ? 'Claimed' : t.reached ? 'Ready' : '') : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </PageShell>
  )
}

export default Vip
