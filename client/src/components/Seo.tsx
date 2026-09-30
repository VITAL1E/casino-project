import { useLocation } from 'react-router-dom'
import site from '../data/site.json'

type Props = {
  title: string
  description: string
  type?: 'website' | 'article'
  noindex?: boolean
  jsonLd?: object
}

// React 19 hoists <title>/<meta>/<link> rendered anywhere into <head>.
const Seo = ({ title, description, type = 'website', noindex, jsonLd }: Props) => {
  const { pathname } = useLocation()
  const url = `${site.site.url}${pathname === '/' ? '' : pathname}`
  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <meta name="robots" content={noindex ? 'noindex,nofollow' : 'index,follow,max-image-preview:large'} />
      <meta property="og:site_name" content={site.site.name} />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {jsonLd && <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>}
    </>
  )
}

export default Seo
