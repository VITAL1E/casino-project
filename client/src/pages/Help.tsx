import PageShell from '../components/PageShell'
import { seoFor } from '../lib/seoFor'
import site from '../data/site.json'

const Help = () => (
  <PageShell
    {...seoFor('/help')}
    h1="Help Center"
    crumbs={[{ label: 'Help' }]}
    intro="Frequently asked questions."
    jsonLd={{
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: site.faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    }}
  >
    {site.faq.map(f => (
      <section key={f.q} className="cp-section">
        <h2>{f.q}</h2>
        <p>{f.a}</p>
      </section>
    ))}
  </PageShell>
)

export default Help
