import { Link, useParams } from 'react-router-dom'
import PageShell from '../components/PageShell'
import { seoFor } from '../lib/seoFor'
import NotFound from './NotFound'
import site from '../data/site.json'

export const Blog = () => (
  <PageShell {...seoFor('/blog')} h1="Blog" crumbs={[{ label: 'Blog' }]}
    intro="Plain-English guides on casino math, fairness and staying in control.">
    <div className="cp-grid">
      {site.posts.map(p => (
        <Link key={p.slug} to={`/blog/${p.slug}`} className="cp-card cp-card--link">
          <time dateTime={p.date}>{p.date}</time>
          <h2>{p.title}</h2>
          <p>{p.description}</p>
        </Link>
      ))}
    </div>
  </PageShell>
)

export const BlogPost = () => {
  const { slug } = useParams()
  const post = site.posts.find(p => p.slug === slug)
  if (!post) return <NotFound />
  return (
    <PageShell
      title={`${post.title} | STACK`}
      description={post.description}
      h1={post.title}
      type="article"
      crumbs={[{ label: 'Blog', to: '/blog' }, { label: post.title }]}
      jsonLd={{
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: post.title,
        description: post.description,
        datePublished: post.date,
        dateModified: post.date,
        author: { '@type': 'Organization', name: site.site.name },
        publisher: { '@type': 'Organization', name: site.site.name },
        mainEntityOfPage: `${site.site.url}/blog/${post.slug}`,
      }}
    >
      <time className="cp-date" dateTime={post.date}>{post.date}</time>
      {post.body.map(p => <p key={p} className="cp-p">{p}</p>)}
      <Link to="/responsible-gambling" className="cp-link">Responsible gambling resources →</Link>
    </PageShell>
  )
}
