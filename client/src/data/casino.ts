export type GameGroup = 'arcade' | 'classics' | 'slots' | 'live' | 'shows' | 'new'

export type Game = {
  id: string
  title: string
  provider: string
  group: GameGroup
  mode?: 'multi' | 'single'   // arcade games only
  hue?: number
  img?: string
  coverTitle?: string[]
}

const u = (id: string) => `https://images.unsplash.com/${id}?w=400&q=80`

// Drop art in src/assets/<folder>/<game-title-slug>.(jpg|png|webp), e.g. slots/sweet-bonanza.jpg — folder = originals (arcade + classics), slots, live, shows or new
const ART_DIR: Record<GameGroup, string> = { arcade: 'originals', classics: 'originals', slots: 'slots', live: 'live', shows: 'shows', new: 'new' }
const gameArt = import.meta.glob<string>("../assets/{originals,slots,live,shows,new}/*.{jpg,jpeg,png,webp}", { eager: true, import: "default" })
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
const artFor = (g: Game) => Object.entries(gameArt).find(([p]) => { const [file, folder] = p.split("/").reverse(); return folder === ART_DIR[g.group] && file.replace(/\.\w+$/, "") === slug(g.title) })?.[1]

const RAW_GAMES: Game[] = [
  { id: 'o12', title: 'Chicken Royale', provider: 'Originals', group: 'arcade', mode: 'multi', hue: 45 },
  { id: 'o10', title: 'Slither Royale', provider: 'Originals', group: 'arcade', mode: 'multi', hue: 140 },
  { id: 'o11', title: 'Agar Royale', provider: 'Originals', group: 'arcade', mode: 'multi', hue: 20 },
  { id: 'o13', title: 'Paper Royale', provider: 'Originals', group: 'arcade', mode: 'multi', hue: 90 },
  { id: 'o14', title: 'Hole Royale', provider: 'Originals', group: 'arcade', mode: 'multi', hue: 260 },
  { id: 'o17', title: 'Storm Royale', provider: 'Originals', group: 'arcade', mode: 'multi', hue: 275 },
  { id: 'o15', title: 'Road Cross', provider: 'Originals', group: 'arcade', mode: 'single', hue: 110 },
  { id: 'o16', title: 'Flappy Cash', provider: 'Originals', group: 'arcade', mode: 'single', hue: 55 },
  { id: 'o1', title: 'Dice',      provider: 'Originals', group: 'classics', hue: 215 },
  { id: 'o2', title: 'Mines',     provider: 'Originals', group: 'classics', hue: 160 },
  { id: 'o3', title: 'Plinko',    provider: 'Originals', group: 'classics', hue: 30 },
  { id: 'o4', title: 'Crash',     provider: 'Originals', group: 'classics', hue: 350 },
  { id: 'o5', title: 'Keno',      provider: 'Originals', group: 'classics', hue: 270 },
  { id: 'o6', title: 'Limbo',     provider: 'Originals', group: 'classics', hue: 190 },
  { id: 'o7', title: 'HiLo',      provider: 'Originals', group: 'classics', hue: 300 },
  { id: 'o8', title: 'Blackjack', provider: 'Originals', group: 'classics', hue: 240 },
  { id: 'o9', title: 'Roulette',  provider: 'Originals', group: 'classics', hue: 120 },

  { id: 's1',  title: 'Wanted Dead or Wild', provider: 'Hacksaw',     group: 'slots', img: u('photo-1587837073080-448bc6a2329b') },
  { id: 's2',  title: 'Sweet Bonanza',       provider: 'Pragmatic',   group: 'slots', img: u('photo-1604881991720-f91add269bed') },
  { id: 's3',  title: 'Gates of Olympus', coverTitle: ['Gates of', 'Olympus'], provider: 'Pragmatic',   group: 'slots', img: u('photo-1558618666-fcd25c85cd64') },
  { id: 's4',  title: 'Book of Dead',        provider: "Play'n GO",   group: 'slots', img: u('photo-1601662528567-526cd06f6582') },
  { id: 's5',  title: 'Starburst',           provider: 'NetEnt',      group: 'slots', img: u('photo-1446776858070-70c3d5ed6758') },
  { id: 's6',  title: 'Mega Moolah',         provider: 'Microgaming', group: 'slots', img: u('photo-1521920592574-49e0b121e992') },
  { id: 's7',  title: 'Razor Shark',         provider: 'Push Gaming', group: 'slots', img: u('photo-1519681393784-d120267933ba') },
  { id: 's8',  title: 'Sugar Rush',          provider: 'Pragmatic',   group: 'slots', img: u('photo-1604881991720-f91add269bed') },

  { id: 'l1', title: 'Blackjack VIP',  provider: 'Evolution', group: 'live', img: u('photo-1655159428752-c700435e9983') },
  { id: 'l2', title: 'Roulette Live',  provider: 'Evolution', group: 'live', img: u('photo-1627831389670-d20f5a01c536') },
  { id: 'l3', title: 'Baccarat',       provider: 'Evolution', group: 'live', img: u('photo-1699136897382-ec50fa3a289c') },
  { id: 'l4', title: 'Poker Live',     provider: 'Evolution', group: 'live', img: u('photo-1626775238053-4315516eedc9') },
  { id: 'l5', title: 'Mega Roulette', provider: 'Evolution', group: 'live', img: u('photo-1627831389670-d20f5a01c536') },
  { id: 'l6', title: 'Fortune Roulette', provider: 'Evolution', group: 'live', img: u('photo-1699136897382-ec50fa3a289c') },

  { id: 'g1', title: 'Crazy Time',   provider: 'Evolution',      group: 'shows', img: u('photo-1618304925090-b68a8c744cbe') },
  { id: 'g2', title: 'Mega Wheel',   provider: 'Pragmatic Live', group: 'shows', img: u('photo-1618304925090-b68a8c744cbe') },
  { id: 'g3', title: 'Dream Catcher', provider: 'Evolution',     group: 'shows', img: u('photo-1618304925090-b68a8c744cbe') },
  { id: 'g4', title: 'Funky Time',   provider: 'Evolution',      group: 'shows', img: u('photo-1618304925090-b68a8c744cbe') },

  { id: 'n1', title: 'Razor Shark 2',     provider: 'Push Gaming', group: 'new', img: u('photo-1519681393784-d120267933ba') },
  { id: 'n2', title: 'Olympus Rising',    provider: 'Pragmatic',   group: 'new', img: u('photo-1558618666-fcd25c85cd64') },
  { id: 'n3', title: 'Bonanza Blast',     provider: 'Hacksaw',     group: 'new', img: u('photo-1604881991720-f91add269bed') },
  { id: 'n4', title: 'Dead Man Wild',     provider: 'Hacksaw',     group: 'new', img: u('photo-1587837073080-448bc6a2329b') },
  { id: 'n5', title: 'Pharaoh Gold',      provider: "Play'n GO",   group: 'new', img: u('photo-1601662528567-526cd06f6582') },
]

export const GAMES: Game[] = RAW_GAMES.map(g => ({ ...g, img: artFor(g) ?? g.img }))

export const GROUPS: { key: GameGroup; label: string }[] = [
  { key: 'arcade',   label: 'Arcades' },
  { key: 'classics', label: 'Classics' },
  { key: 'slots',     label: 'Slots' },
  { key: 'live',      label: 'Live Casino' },
]

export const getGame = (id: string) => GAMES.find(g => g.id === id)

const VOLATILITY = ['Low', 'Medium', 'High', 'Very High']

// Deterministic mock stats until a provider API supplies real ones
// Real figures for the classic games (see client/src/games/classics/math.ts); everything else is still mock data.
const CLASSIC_META: Record<string, { rtp: string; volatility: string; maxWin: string }> = {
  o1: { rtp: '99.00', volatility: 'Adjustable', maxWin: '9,900x' },
  o2: { rtp: '99.00', volatility: 'Adjustable', maxWin: '1,000,000 per bet' },
  o3: { rtp: '99.00', volatility: 'Adjustable', maxWin: 'up to ~480x' },
  o4: { rtp: '99.00', volatility: 'High', maxWin: '1,000,000 per bet' },
  o5: { rtp: '99.00', volatility: 'Adjustable', maxWin: 'up to ~10,000x' },
  o6: { rtp: '99.00', volatility: 'Adjustable', maxWin: '1,000,000 per bet' },
  o7: { rtp: '99.00', volatility: 'Adjustable', maxWin: '1,000,000 per bet' },
  o8: { rtp: '98.00', volatility: 'Low', maxWin: '2.5x (blackjack pays 3:2)' },
  o9: { rtp: '97.30', volatility: 'Adjustable', maxWin: '36x' },
}

export const gameMeta = (game: Game) => {
  const real = CLASSIC_META[game.id]
  if (real) return real
  const n = [...game.id].reduce((a, c) => a + c.charCodeAt(0), 0)
  return {
    rtp: (94 + (n % 40) / 10).toFixed(2),
    volatility: VOLATILITY[n % VOLATILITY.length],
    maxWin: `${[1000, 5000, 10000, 25000, 50000][n % 5].toLocaleString()}x`,
  }
}
