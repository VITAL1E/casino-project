// Post-build SEO step: writes a per-route dist/<path>/index.html with the
// right <title>, description, canonical, Open Graph tags and crawlable body
// text (React replaces it on load), plus sitemap.xml and robots.txt.
// Site URL: SITE_URL env var, else site.json.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const site = JSON.parse(await readFile(join(root, 'src/data/site.json'), 'utf8'))
const base = (process.env.SITE_URL ?? site.site.url).replace(/\/$/, '')
const template = (await readFile(join(dist, 'index.html'), 'utf8')).replaceAll(site.site.url, base)

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

const casinoSrc = await readFile(join(root, 'src/data/casino.ts'), 'utf8')
const games = [...casinoSrc.matchAll(/\{ id: '(\w+)', title: '([^']+)'/g)].map(m => ({ id: m[1], title: m[2] }))

const routes = [
  ...site.routes.map(r => ({ ...r, body: r.description })),
  ...Object.entries(site.pages).map(([slug, p]) => ({
    path: `/${slug}`, title: p.title, description: p.description, priority: 0.4, changefreq: 'yearly',
    body: [p.intro, ...p.sections.flatMap(s => [s.h, ...s.p])].join(' '),
  })),
  ...site.posts.map(p => ({
    path: `/blog/${p.slug}`, title: `${p.title} | ${site.site.name}`, description: p.description,
    priority: 0.7, changefreq: 'monthly', lastmod: p.date, body: p.body.join(' '),
  })),
  ...games.map(g => ({
    path: `/casino/games/${g.id}`, title: `Play ${g.title} | ${site.site.name}`,
    description: `Play ${g.title} on ${site.site.name}. Transparent rules and no bonus traps.`,
    priority: 0.5, changefreq: 'monthly', body: `Play ${g.title}.`,
  })),
]

const render = r => {
  const url = r.path === '/' ? base : `${base}${r.path}`
  const head = [
    `<title>${esc(r.title)}</title>`,
    `<meta name="description" content="${esc(r.description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:title" content="${esc(r.title)}" />`,
    `<meta property="og:description" content="${esc(r.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
  ].join('\n    ')
  const h1 = r.title.split(' | ')[0]
  return template
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<meta name="description"[^>]*>\s*/, '')
    .replace(/<link rel="canonical"[^>]*>\s*/, '')
    .replace(/<meta property="og:(title|description|url)"[^>]*>\s*/g, '')
    .replace('</head>', `    ${head}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root"><h1>${esc(h1)}</h1><p>${esc(r.body)}</p></div>`)
}

for (const r of routes) {
  const file = r.path === '/' ? join(dist, 'index.html') : join(dist, r.path, 'index.html')
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, render(r))
}

const today = new Date().toISOString().slice(0, 10)
const urls = routes.map(r => `  <url><loc>${r.path === '/' ? base : base + r.path}</loc><lastmod>${r.lastmod ?? today}</lastmod><changefreq>${r.changefreq}</changefreq><priority>${r.priority.toFixed(1)}</priority></url>`)
await writeFile(join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`)
await writeFile(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${base}/sitemap.xml\n`)
console.log(`prerendered ${routes.length} routes`)
