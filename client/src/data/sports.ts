// Match data used to be mocked here. It's real now — see
// src/lib/sportsApi.ts (server/sports/ proxies The Odds API). This file
// only keeps the cosmetic bits: which sport tabs exist and their art.
export type SportKey =
  | 'soccer' | 'basketball' | 'american-football' | 'tennis' | 'counter-strike'
  | 'ice-hockey' | 'baseball' | 'boxing' | 'table-tennis'

export const SPORTS: { key: SportKey; label: string }[] = [
  { key: 'soccer',            label: 'Soccer' },
  { key: 'basketball',        label: 'Basketball' },
  { key: 'american-football', label: 'American Football' },
  { key: 'tennis',            label: 'Tennis' },
  { key: 'counter-strike',    label: 'Counter-Strike' },
  { key: 'ice-hockey',        label: 'Ice Hockey' },
  { key: 'baseball',          label: 'Baseball' },
  { key: 'boxing',            label: 'Boxing' },
  { key: 'table-tennis',      label: 'Table Tennis' },
]

// Drop art in src/assets/sports/<sport-key>.(jpg|png|webp), e.g. soccer.jpg — replaces the placeholder photo
const sportFiles = import.meta.glob<string>('../assets/sports/*.{jpg,jpeg,png,webp}', { eager: true, import: 'default' })

const u = (id: string) => `https://images.unsplash.com/${id}?w=600&q=80`
const PLACEHOLDER: Record<SportKey, { img: string; hue: number }> = {
  'soccer':            { img: u('photo-1431324155629-1a6deb1dec8d'), hue: 140 },
  'basketball':        { img: u('photo-1546519638-68e109498ffc'),    hue: 25 },
  'american-football': { img: u('photo-1566577739112-5180d4bf9390'), hue: 100 },
  'tennis':            { img: u('photo-1554068865-24cecd4e34b8'),    hue: 75 },
  'counter-strike':    { img: u('photo-1542751371-adc38448a05e'),    hue: 260 },
  'ice-hockey':        { img: u('photo-1580692475446-c2fabbbbf835'), hue: 200 },
  'baseball':          { img: u('photo-1529768167801-9173d94c2a42'), hue: 10 },
  'boxing':            { img: u('photo-1549719386-74dfcbf7dbed'),    hue: 350 },
  'table-tennis':      { img: u('photo-1609710228159-0fa9bd7c0827'), hue: 320 },
}

export const hasSportFile = (sport: SportKey) =>
  Object.keys(sportFiles).some(p => p.split('/').pop()!.replace(/.w+$/, '') === sport)

// CSS background value: the image on top, a sport-tinted gradient underneath in case it fails to load
export const sportArt = (sport: SportKey) => {
  const file = Object.entries(sportFiles).find(([p]) => p.split('/').pop()!.replace(/\.\w+$/, '') === sport)?.[1]
  const { img, hue } = PLACEHOLDER[sport]
  return `url(${file ?? img}), linear-gradient(160deg, hsl(${hue} 60% 40%), hsl(${hue + 30} 60% 15%))`
}

// "Today, 19:45" / "Tomorrow, 02:00" / "Mon, 14:00" from an ISO commence_time.
export const formatMatchTime = (iso: string) => {
  const d = new Date(iso)
  const now = new Date()
  const dayMs = 24 * 60 * 60 * 1000
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((startOfDay(d) - startOfDay(now)) / dayMs)
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 0) return `Today, ${time}`
  if (diffDays === 1) return `Tomorrow, ${time}`
  return `${d.toLocaleDateString([], { weekday: 'short' })}, ${time}`
}
