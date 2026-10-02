import NetShell, { type NetAdapter } from '../net/NetShell'
import { setTarget, easeToTargets } from '../net/smooth'
import { land, N, type World, type Player } from './engine'
import type { PaperSnap } from './net'

const layout = (W: number, H: number) => {
  const size = Math.min(W, H) - 16
  return { size, cell: size / N, ox: (W - size) / 2, oy: (H - size) / 2 }
}

const pct = (w: World, id: number) => `${((land(w, id) / (N * N)) * 100).toFixed(1)}%`

const adapter: NetAdapter<World, PaperSnap> = {
  key: 'paper',
  title: 'Paper Royale',
  blurb: 'Claim land by drawing loops out of your territory and back home. Cross a rival\'s trail to eliminate them, but if anyone crosses yours you\'re out. Most land after 1 minute (or last one standing) takes the pool.',
  create: (you, seats) => {
    const players: Player[] = seats.map(s => ({
      id: s.id, name: s.name, hue: s.hue, human: s.id === you, auto: false,
      x: 0, y: 0, angle: 0, want: 0, alive: true, trail: [], kills: 0, place: 0, aggr: 0, think: 0, h0: 0, dir: 1, a: 0, b: 0, dist: 0,
    }))
    return { t: 0, owner: new Uint8Array(N * N), trailOf: new Uint8Array(N * N), players, over: false, winner: -1 }
  },

  apply: (w, snap) => {
    w.t = snap.t
    w.trailOf.fill(0)
    for (const s of snap.players) {
      const p = w.players[s.id]
      setTarget(p, s.x, s.y)
      p.angle = s.angle; p.alive = s.al; p.kills = s.k; p.place = s.p; p.trail = s.trail
      for (const c of s.trail) w.trailOf[c] = s.id + 1
    }
    if (snap.owner) {
      const bin = atob(snap.owner)
      for (let i = 0; i < bin.length; i++) w.owner[i] = bin.charCodeAt(i)
    }
  },

  smooth: (w, dt) => easeToTargets(w.players, dt),

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
    return { want: Math.atan2(py - (oy + me.y * cell), px - (ox + me.x * cell)) }
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

const Paper = () => <NetShell adapter={adapter} />

export default Paper
