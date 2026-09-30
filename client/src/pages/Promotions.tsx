import { Link } from 'react-router-dom'
import PageShell from '../components/PageShell'
import { seoFor } from '../lib/seoFor'
import site from '../data/site.json'

const Promotions = () => (
  <PageShell {...seoFor('/promotions')} h1="Promotions" crumbs={[{ label: 'Promotions' }]}
    intro="No inflated welcome bonus and no wagering traps. Here is exactly what you get.">
    <div className="cp-grid">
      {site.promotions.map(p => (
        <div key={p.title} className="cp-card">
          <h2>{p.title}</h2>
          <p>{p.text}</p>
        </div>
      ))}
    </div>
    <Link to="/fairness" className="cp-link">How results are verified →</Link>
  </PageShell>
)

export default Promotions
