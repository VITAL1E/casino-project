import { useParams } from 'react-router-dom'
import PageShell from '../components/PageShell'
import NotFound from './NotFound'
import site from '../data/site.json'

type InfoPage = { title: string; description: string; h1: string; intro: string; sections: { h: string; p: string[] }[] }
const pages: Record<string, InfoPage> = site.pages

const Info = () => {
  const { slug = '' } = useParams()
  const page = Object.hasOwn(pages, slug) ? pages[slug] : undefined
  if (!page) return <NotFound />
  return (
    <PageShell title={page.title} description={page.description} h1={page.h1} intro={page.intro} crumbs={[{ label: page.h1 }]}>
      {page.sections.map(s => (
        <section key={s.h} className="cp-section">
          <h2>{s.h}</h2>
          {s.p.map(p => <p key={p}>{p}</p>)}
        </section>
      ))}
    </PageShell>
  )
}

export default Info
