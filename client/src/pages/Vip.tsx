import PageShell from '../components/PageShell'
import { seoFor } from '../lib/seoFor'
import site from '../data/site.json'

const Vip = () => (
  <PageShell {...seoFor('/vip')} h1="VIP Club" crumbs={[{ label: 'VIP' }]}
    intro="Preview only: levels are not being earned yet. Requirements marked Planned are not final.">
    <table className="cp-table">
      <thead><tr><th>Tier</th><th>Requirement</th><th>Perk</th></tr></thead>
      <tbody>
        {site.vip.map(t => <tr key={t.tier}><td>{t.tier}</td><td>{t.req}</td><td>{t.perk}</td></tr>)}
      </tbody>
    </table>
  </PageShell>
)

export default Vip
