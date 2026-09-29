import RoyaleShell, { type Adapter } from '../royale/RoyaleShell'
import { createWorld, step, land, N, type World } from './engine'

const layout = (W: number, H: number) => {
  const size = Math.min(W, H) - 16
  return { size, cell: size / N, ox: (W - size) / 2, oy: (H - size) / 2 }
}

const pct = (w: World, id: number) => `${((land(w, id) / (N * N)) * 100).toFixed(1)}%`

const adapter: Adapter<World> = {
  title: 'Paper Royale',
  blurb: 'Claim land by drawing loops out of your territory and back home. Cross a rival\'s trail to eliminate them, but if anyone crosses yours you\'re out. Most land after 1 minute (or last one standing) takes the pool.',
  create: createWorld,
  step,
  over: w => w.over,
  time: w => w.t,
  skip: w => { while (!w.over) step(w, 0.05) },

  result: w => {
    const me = w.players.find(p => p.human)!
    return { won: me.id === w.winner, place: me.place, kills: me.kills }
  },

  hud: w => {
    const me = w.players.find(p => p.human)!
    return {
      t: w.t,
      chips: [
        { label: 'Alive', value: `${w.players.filter(p => p.alive).length}/${w.players.length}` },
        { label: 'Land', value: pct(w, me.id) },
      ],
      board: [...w.players]
        .map(p => ({ p, l: land(w, p.id) }))
        .sort((a, b) => Number(b.p.alive) - Number(a.p.alive) || b.l - a.l)
        .slice(0, 5)
        .map(({ p, l }) => ({ name: p.name, value: `${((l / (N * N)) * 100).toFixed(1)}%`, me: p.human, alive: p.alive })),
      note: 'Steer with your mouse · close a loop to claim land',
      me: me.alive,
    }
  },

  aim: (w, px, py, W, H) => {
    const me = w.players.find(p => p.human)!
    const { cell, ox, oy } = layout(W, H)
    return Math.atan2(py - (oy + me.y * cell), px - (ox + me.x * cell))
  },

  draw: (ctx, w, W, H, c) => {
    const { size, cell, ox, oy } = layout(W, H)
    ctx.fillStyle = c.bg
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = c.surface
    ctx.fillRect(ox, oy, size, size)

    // faint grid
    ctx.strokeStyle = c.grid
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 0; i <= N; i += 5) {
      ctx.moveTo(ox + i * cell, oy); ctx.lineTo(ox + i * cell, oy + size)
      ctx.moveTo(ox, oy + i * cell); ctx.lineTo(ox + size, oy + i * cell)
    }
    ctx.stroke()

    for (let i = 0; i < w.owner.length; i++) {
      const o = w.owner[i]
      const t = w.trailOf[i]
      if (!o && !t) continue
      const x = ox + (i % N) * cell, y = oy + Math.floor(i / N) * cell
      if (o) {
        ctx.fillStyle = `hsl(${w.players[o - 1].hue} 60% 38%)`
        ctx.fillRect(x, y, cell + 0.5, cell + 0.5)
      }
      if (t) {
        ctx.fillStyle = `hsl(${w.players[t - 1].hue} 85% 62% / 0.7)`
        ctx.fillRect(x, y, cell + 0.5, cell + 0.5)
      }
    }

    ctx.strokeStyle = c.danger
    ctx.lineWidth = 3
    ctx.strokeRect(ox, oy, size, size)

    for (const p of w.players) {
      if (!p.alive) continue
      const x = ox + p.x * cell, y = oy + p.y * cell
      ctx.fillStyle = `hsl(${p.hue} 90% 60%)`
      ctx.beginPath(); ctx.arc(x, y, cell * 0.85, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = c.white
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.fillStyle = p.human ? c.accent : c.white
      ctx.font = '700 11px Manrope, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(p.name, x, y - cell * 1.3)
    }

  },
}

const Paper = () => <RoyaleShell adapter={adapter} />

export default Paper
