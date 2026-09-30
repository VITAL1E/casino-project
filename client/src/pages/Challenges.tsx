import { Link } from 'react-router-dom'
import PageShell from '../components/PageShell'
import { seoFor } from '../lib/seoFor'
import site from '../data/site.json'

const Challenges = () => (
  <PageShell {...seoFor('/challenges')} h1="Challenges" crumbs={[{ label: 'Challenges' }]}
    intro="Preview of upcoming missions. Tracking and rewards are not live yet.">
    <div className="cp-grid">
      {site.challenges.map(c => (
        <div key={c.title} className="cp-card">
          <span className="cp-tag">{c.game}</span>
          <h2>{c.title}</h2>
        </div>
      ))}
    </div>
    <Link to="/casino" className="cp-link">Browse games →</Link>
  </PageShell>
)

export default Challenges
