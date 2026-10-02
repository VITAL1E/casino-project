import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageShell from '../components/PageShell'
import { seoFor } from '../lib/seoFor'
import { useAuth } from '../lib/auth/context'
import { ApiError } from '../lib/apiClient'
import { claimChallenge, getChallenges, getRewardsInfo, type ChallengeDef, type Challenges as State } from '../lib/rewardsApi'

const until = (iso: string, now: number) => {
  const ms = Math.max(0, new Date(iso).getTime() - now)
  return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`
}

const Challenges = () => {
  const { user, openAuth } = useAuth()
  const [defs, setDefs] = useState<ChallengeDef[]>([])
  const [state, setState] = useState<State | null>(null)
  const [msg, setMsg] = useState('')
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let live = true
    getRewardsInfo().then(i => { if (live) setDefs(i.challenges) }).catch(() => undefined)
    return () => { live = false }
  }, [])
  useEffect(() => {
    let live = true
    if (user) getChallenges().then(s => { if (live) setState(s) }).catch(() => undefined)
    return () => { live = false }
  }, [user])
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const claim = async (id: string) => {
    try {
      const r = await claimChallenge(id)
      setMsg(`+${r.reward} credits added to your balance`)
      setState(await getChallenges())
    } catch (e) { setMsg(e instanceof ApiError ? e.message : 'Could not claim') }
  }

  const rows = state?.challenges ?? defs.map(d => ({ ...d, progress: 0, done: false, claimed: false }))

  return (
    <PageShell {...seoFor('/challenges')} h1="Daily Challenges" crumbs={[{ label: 'Challenges' }]}
      intro="Complete challenges by playing and claim play credits. They reset every day at 00:00 UTC.">
      {!user && (
        <div className="cp-card">
          <p>Log in to track your progress and claim rewards.</p>
          <button className="btn-primary cp-btn" onClick={() => openAuth('login')}>Log in</button>
        </div>
      )}
      {state && <p className="cp-intro">Resets in {until(state.resetsAt, now)}</p>}
      {msg && <p className="cp-intro">{msg}</p>}

      <div className="cp-grid">
        {rows.map(c => (
          <div key={c.id} className="cp-card">
            <span className="cp-tag">+{c.reward} credits</span>
            <h2>{c.title}</h2>
            <div className="cp-bar"><i style={{ width: `${Math.min(100, (c.progress / c.target) * 100)}%` }} /></div>
            <p>{Math.min(c.progress, c.target)} / {c.target}</p>
            {user && c.done && !c.claimed && <button className="btn-primary cp-btn" onClick={() => claim(c.id)}>Claim reward</button>}
            {c.claimed && <p>Claimed</p>}
          </div>
        ))}
      </div>
      <Link to="/casino" className="cp-link">Browse games →</Link>
    </PageShell>
  )
}

export default Challenges
