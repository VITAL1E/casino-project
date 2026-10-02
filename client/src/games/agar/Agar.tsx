import NetShell, { type NetAdapter } from '../net/NetShell'
import { setTarget, easeToTargets } from '../net/smooth'
import { zoneRadius, radiusOf, type World, type Cell, type Food } from './engine'
import type { AgarSnap } from './net'

// Food is delta-encoded by id, so keep an id -> food map beside each mirror world.
const foodIds = new WeakMap<World, Map<number, Food>>()
const cam = { x: 0, y: 0, at: 0 }

const adapter: NetAdapter<World, AgarSnap> = {
  key: 'agar',
  title: 'Agar Royale',
  blurb: '10 cells, 1 minute, winner takes the whole pool. Eat smaller cells, avoid bigger ones, and stay inside the shrinking zone.',

  create: (you, seats) => {
    const cells: Cell[] = seats.map(s => ({
      id: s.id, name: s.name, hue: s.hue, human: s.id === you, auto: false,
      x: 0, y: 0, want: 0, mass: 20, hp: 100, alive: true, kills: 0, place: 0, aggr: 0, think: 0,
    }))
    const w: World = { t: 0, cells, food: [], nextFood: 0, over: false, winner: -1 }
    foodIds.set(w, new Map())
    cam.at = 0
    return w
  },

  apply: (w, snap) => {
    w.t = snap.t
    for (const s of snap.cells) {
      const c = w.cells[s.id]
      setTarget(c, s.x, s.y)
      c.mass = s.mass; c.hp = s.hp; c.alive = s.al; c.kills = s.k; c.place = s.p
    }
    const ids = foodIds.get(w)!
    for (const id of snap.foodDel) ids.delete(id)
    for (const [id, x, y, v, hue] of snap.foodAdd) ids.set(id, { id, x, y, v, hue })
    w.food = [...ids.values()]
  },

  smooth: (w, dt) => easeToTargets(w.cells, dt),

  hud: w => {
    const me = w.cells.find(c => c.human)!
    return {
      t: w.t,
      chips: [{ label: 'Alive', value: `${w.cells.filter(c => c.alive).length}/${w.cells.length}` }],
      board: [...w.cells]
        .sort((a, b) => Number(b.alive) - Number(a.alive) || b.mass - a.mass)
        .slice(0, 5)
        .map(c => ({ name: c.name, value: String(Math.floor(c.mass)), me: c.human, alive: c.alive })),
      note: 'Move your mouse to steer · eat smaller cells',
      me: me.alive,
    }
  },

  aim: (_w, px, py, W, H) => ({ want: Math.atan2(py - H / 2, px - W / 2) }),

  draw: (ctx, w, W, H, c, now) => {
    const me = w.cells.find(x => x.human)!
    const dt = cam.at ? Math.min((now - cam.at) / 1000, 0.05) : 1
    cam.at = now

    // camera: follow player, or the current leader once eliminated
    const focus = me.alive ? me : w.cells.filter(x => x.alive).sort((a, b) => b.mass - a.mass)[0] ?? me
    cam.x += (focus.x - cam.x) * Math.min(1, dt * 8)
    cam.y += (focus.y - cam.y) * Math.min(1, dt * 8)
    const zoom = Math.max(0.45, 1 - (radiusOf(focus) - 13) / 150) * Math.min(W, H * 1.4) / 900
    const sx = (x: number) => (x - cam.x) * zoom + W / 2
    const sy = (y: number) => (y - cam.y) * zoom + H / 2

    ctx.fillStyle = c.bg
    ctx.fillRect(0, 0, W, H)

    // dotted grid
    const gs = 60 * zoom
    ctx.fillStyle = c.grid
    for (let x = ((-cam.x * zoom + W / 2) % gs + gs) % gs; x < W; x += gs)
      for (let y = ((-cam.y * zoom + H / 2) % gs + gs) % gs; y < H; y += gs)
        ctx.fillRect(x - 1, y - 1, 2, 2)

    // danger zone outside the safe circle
    const R = zoneRadius(w.t)
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, W, H)
    ctx.arc(sx(0), sy(0), R * zoom, 0, Math.PI * 2, true)
    ctx.globalAlpha = 0.22
    ctx.fillStyle = c.danger
    ctx.fill('evenodd')
    ctx.restore()
    ctx.strokeStyle = c.danger
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(sx(0), sy(0), R * zoom, 0, Math.PI * 2)
    ctx.stroke()

    for (const f of w.food) {
      const x = sx(f.x), y = sy(f.y)
      if (x < -10 || y < -10 || x > W + 10 || y > H + 10) continue
      ctx.fillStyle = `hsl(${f.hue} 90% 60%)`
      ctx.beginPath()
      ctx.arc(x, y, (2 + f.v * 0.5) * zoom + 1, 0, Math.PI * 2)
      ctx.fill()
    }

    // cells, smallest first so big ones draw on top
    for (const cell of [...w.cells].filter(x => x.alive).sort((p, q) => p.mass - q.mass)) {
      const r = radiusOf(cell) * zoom
      const x = sx(cell.x), y = sy(cell.y)
      ctx.fillStyle = `hsl(${cell.hue} 80% 52%)`
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = `hsl(${cell.hue} 85% 68%)`
      ctx.lineWidth = Math.max(2, r * 0.08)
      ctx.stroke()
      ctx.fillStyle = cell.human ? c.accent : c.white
      ctx.font = `800 ${Math.max(10, r * 0.42)}px Manrope, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(cell.name, x, y)
      ctx.textBaseline = 'alphabetic'
    }
  },
}

const Agar = () => <NetShell adapter={adapter} />

export default Agar
