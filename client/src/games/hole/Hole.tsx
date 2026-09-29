import RoyaleShell, { type Adapter } from '../royale/RoyaleShell'
import { createWorld, step, radiusOf, WORLD, type World, type Thing } from './engine'

const camera = (w: World, W: number, H: number) => {
  const me = w.holes.find(h => h.human)!
  const focus = me.alive ? me : w.holes.filter(h => h.alive).sort((a, b) => b.area - a.area)[0] ?? me
  const zoom = Math.min(W, H * 1.4) / 900 * Math.max(0.35, 1 - (radiusOf(focus) - 22) / 260)
  return { cx: focus.x, cy: focus.y, zoom }
}

const drawThing = (ctx: CanvasRenderingContext2D, t: Thing, x: number, y: number, s: number) => {
  const r = t.r * s
  if (r < 0.5) return
  switch (t.kind) {
    case 'coin':
      ctx.fillStyle = `hsl(${t.hue} 95% 55%)`
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
      break
    case 'tree':
      ctx.fillStyle = `hsl(${t.hue} 55% 32%)`
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = `hsl(${t.hue} 55% 42%)`
      ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.55, 0, Math.PI * 2); ctx.fill()
      break
    case 'car':
      ctx.fillStyle = `hsl(${t.hue} 75% 52%)`
      ctx.fillRect(x - r, y - r * 0.55, r * 2, r * 1.1)
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      ctx.fillRect(x - r * 0.35, y - r * 0.4, r * 0.7, r * 0.8)
      break
    case 'house':
      ctx.fillStyle = `hsl(${t.hue} 45% 62%)`
      ctx.fillRect(x - r, y - r, r * 2, r * 2)
      ctx.fillStyle = `hsl(${t.hue} 55% 38%)`
      ctx.fillRect(x - r, y - r, r * 2, r * 0.9)
      ctx.fillRect(x - r, y + r * 0.1, r * 2, r * 0.05)
      break
    case 'tower':
      ctx.fillStyle = `hsl(${t.hue} 25% 40%)`
      ctx.fillRect(x - r, y - r, r * 2, r * 2)
      ctx.fillStyle = `hsl(${t.hue} 40% 62%)`
      for (let i = -2; i <= 2; i += 2)
        for (let j = -2; j <= 2; j += 2) ctx.fillRect(x + i * r * 0.32 - r * 0.1, y + j * r * 0.32 - r * 0.1, r * 0.2, r * 0.2)
      break
  }
}

const adapter: Adapter<World> = {
  title: 'Hole Royale',
  blurb: 'Swallow coins, trees, cars, houses and towers to grow. Bigger holes swallow smaller holes whole, and swallowed holes are out. Biggest hole after 1 minute (or the last one left) takes the pool.',
  create: createWorld,
  step,
  over: w => w.over,
  time: w => w.t,
  skip: w => { while (!w.over) step(w, 0.05) },

  result: w => {
    const me = w.holes.find(h => h.human)!
    return { won: me.id === w.winner, place: me.place, kills: me.kills }
  },

  hud: w => {
    const me = w.holes.find(h => h.human)!
    return {
      t: w.t,
      chips: [
        { label: 'Alive', value: `${w.holes.filter(h => h.alive).length}/${w.holes.length}` },
        { label: 'Size', value: String(Math.round(radiusOf(me))) },
      ],
      board: [...w.holes]
        .sort((a, b) => Number(b.alive) - Number(a.alive) || b.area - a.area)
        .slice(0, 5)
        .map(h => ({ name: h.name, value: String(Math.round(radiusOf(h))), me: h.human, alive: h.alive })),
      note: 'Move your mouse to steer · swallow anything smaller than you',
      me: me.alive,
    }
  },

  aim: (_w, px, py, W, H) => Math.atan2(py - H / 2, px - W / 2),

  draw: (ctx, w, W, H, c) => {
    const { cx, cy, zoom } = camera(w, W, H)
    const sx = (x: number) => (x - cx) * zoom + W / 2
    const sy = (y: number) => (y - cy) * zoom + H / 2

    ctx.fillStyle = c.bg
    ctx.fillRect(0, 0, W, H)

    // city ground with a street grid
    ctx.fillStyle = c.surface
    ctx.fillRect(sx(-WORLD), sy(-WORLD), WORLD * 2 * zoom, WORLD * 2 * zoom)
    ctx.strokeStyle = c.grid
    ctx.lineWidth = Math.max(1, 14 * zoom)
    ctx.beginPath()
    for (let i = -WORLD; i <= WORLD; i += 200) {
      ctx.moveTo(sx(i), sy(-WORLD)); ctx.lineTo(sx(i), sy(WORLD))
      ctx.moveTo(sx(-WORLD), sy(i)); ctx.lineTo(sx(WORLD), sy(i))
    }
    ctx.stroke()
    ctx.strokeStyle = c.danger
    ctx.lineWidth = 3
    ctx.strokeRect(sx(-WORLD), sy(-WORLD), WORLD * 2 * zoom, WORLD * 2 * zoom)

    const on = (x: number, y: number, r: number) => x > -r && y > -r && x < W + r && y < H + r

    for (const t of w.things) {
      const x = sx(t.x), y = sy(t.y)
      if (on(x, y, t.r * zoom)) drawThing(ctx, t, x, y, zoom)
    }
    for (const s of w.sucked) drawThing(ctx, s, sx(s.x), sy(s.y), zoom * Math.max(0, s.t / 0.25))

    // holes, smallest first
    for (const h of [...w.holes].filter(h => h.alive).sort((a, b) => a.area - b.area)) {
      const r = radiusOf(h) * zoom
      const x = sx(h.x), y = sy(h.y)
      if (!on(x, y, r * 1.4)) continue
      const g = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 1.25)
      g.addColorStop(0, 'rgba(0,0,0,0.55)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(x, y, r * 1.25, 0, Math.PI * 2); ctx.fill()

      ctx.fillStyle = '#000'
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = `hsl(${h.hue} 90% 60%)`
      ctx.lineWidth = Math.max(3, r * 0.08)
      ctx.stroke()

      ctx.fillStyle = h.human ? c.accent : c.white
      ctx.font = `800 ${Math.max(11, r * 0.3)}px Manrope, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(h.name, x, y)
      ctx.textBaseline = 'alphabetic'
    }
  },
}

const Hole = () => <RoyaleShell adapter={adapter} />

export default Hole
