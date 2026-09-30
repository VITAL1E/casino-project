import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Seo from './Seo'

type Props = {
  title: string
  description: string
  h1: string
  intro?: string
  crumbs?: { label: string; to?: string }[]
  type?: 'website' | 'article'
  jsonLd?: object
  children?: ReactNode
}

const PageShell = ({ title, description, h1, intro, crumbs, type, jsonLd, children }: Props) => (
  <article className="cp-page">
    <Seo title={title} description={description} type={type} jsonLd={jsonLd} />
    {crumbs && (
      <nav className="cp-crumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        {crumbs.map(c => (
          <span key={c.label}>
            {' / '}
            {c.to ? <Link to={c.to}>{c.label}</Link> : c.label}
          </span>
        ))}
      </nav>
    )}
    <h1 className="cp-h1">{h1}</h1>
    {intro && <p className="cp-intro">{intro}</p>}
    {children}
  </article>
)

export default PageShell
