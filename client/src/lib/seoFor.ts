import site from '../data/site.json'

export const seoFor = (path: string) => {
  const r = site.routes.find(x => x.path === path)
  if (!r) throw new Error(`no seo entry for ${path}`)
  return { title: r.title, description: r.description }
}
