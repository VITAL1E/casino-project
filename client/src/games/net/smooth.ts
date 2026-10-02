// Snapshots arrive at 20Hz; to keep motion smooth the mirror world's moving entities
// are eased toward the newest snapshot position every frame instead of jumping.
type Mover = { x: number; y?: number; z?: number }

const targets = new WeakMap<object, { x: number; y?: number; z?: number }>()

// Record where an entity should be; the first time we see it, place it there straight away.
export const setTarget = (e: Mover, x: number, y?: number, z?: number) => {
  if (!targets.has(e)) { e.x = x; if (y !== undefined) e.y = y; if (z !== undefined) e.z = z }
  targets.set(e, { x, y, z })
}

export const easeToTargets = (movers: Iterable<Mover>, dt: number, rate = 16) => {
  const k = Math.min(1, dt * rate)
  for (const e of movers) {
    const t = targets.get(e)
    if (!t) continue
    e.x += (t.x - e.x) * k
    if (t.y !== undefined && e.y !== undefined) e.y += (t.y - e.y) * k
    if (t.z !== undefined && e.z !== undefined) e.z += (t.z - e.z) * k
  }
}
