export const MAP_R = 140

export type BoxKind = 'wall' | 'tree' | 'rock' | 'crate' | 'build'
// axis-aligned solid: centre (x, z), size w (x) × d (z), height h
export type Box = { id: number; kind: BoxKind; x: number; z: number; w: number; d: number; h: number; hp: number; owner: number; born: number }
export type Building = { cx: number; cz: number; w: number; d: number }
export type Tree = { x: number; z: number; s: number }

export const mulberry32 = (seed: number) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export type GameMap = {
  boxes: Box[]
  buildings: Building[]
  trees: Tree[]
  spawns: { x: number; z: number }[]
  lootSpots: { x: number; z: number }[]
  nextId: number
}

export const genMap = (rand: () => number, players: number): GameMap => {
  const boxes: Box[] = []
  let id = 1
  const add = (kind: BoxKind, x: number, z: number, w: number, d: number, h: number) => {
    boxes.push({ id: id++, kind, x, z, w, d, h, hp: Infinity, owner: -1, born: 0 })
  }

  const spawns = Array.from({ length: players }, (_, i) => {
    const a = (i / players) * Math.PI * 2 + rand() * 0.3
    return { x: Math.cos(a) * 92, z: Math.sin(a) * 92 }
  })

  const buildings: Building[] = []
  const lootSpots: { x: number; z: number }[] = []
  for (let tries = 0; tries < 400 && buildings.length < 14; tries++) {
    const r = Math.sqrt(rand()) * 104
    const a = rand() * Math.PI * 2
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r
    const w = 10 + rand() * 6, d = 10 + rand() * 6
    if (spawns.some(s => Math.hypot(s.x - cx, s.z - cz) < Math.max(w, d) / 2 + 9)) continue
    if (buildings.some(b => Math.hypot(b.cx - cx, b.cz - cz) < (Math.max(b.w, b.d) + Math.max(w, d)) / 2 + 8)) continue
    buildings.push({ cx, cz, w, d })

    const t = 0.5, h = 3.2, gap = 3.4
    // four sides, each may get a door
    const doors = [rand() < 0.75, rand() < 0.75, rand() < 0.75, rand() < 0.75]
    if (!doors.some(Boolean)) doors[0] = true
    const side = (horizontal: boolean, fx: number, fz: number, len: number, door: boolean) => {
      if (!door) {
        if (horizontal) add('wall', fx, fz, len, t, h)
        else add('wall', fx, fz, t, len, h)
        return
      }
      const off = (rand() - 0.5) * (len - gap - 3)
      const a1 = (len - gap) / 2 + off, a2 = len - gap - a1
      const start = -len / 2
      if (horizontal) {
        add('wall', fx + start + a1 / 2, fz, a1, t, h)
        add('wall', fx + len / 2 - a2 / 2, fz, a2, t, h)
      } else {
        add('wall', fx, fz + start + a1 / 2, t, a1, h)
        add('wall', fx, fz + len / 2 - a2 / 2, t, a2, h)
      }
    }
    side(true, cx, cz - d / 2, w, doors[0])
    side(true, cx, cz + d / 2, w, doors[1])
    side(false, cx - w / 2, cz, d, doors[2])
    side(false, cx + w / 2, cz, d, doors[3])
    // cover inside
    add('crate', cx + (rand() - 0.5) * (w - 4), cz + (rand() - 0.5) * (d - 4), 1, 1, 0.9)
    lootSpots.push({ x: cx, z: cz }, { x: cx + (rand() - 0.5) * (w - 3), z: cz + (rand() - 0.5) * (d - 3) })
  }

  const free = (x: number, z: number, pad: number) =>
    !spawns.some(s => Math.hypot(s.x - x, s.z - z) < pad + 2) &&
    !buildings.some(b => Math.abs(b.cx - x) < b.w / 2 + pad && Math.abs(b.cz - z) < b.d / 2 + pad)

  const trees: Tree[] = []
  for (let tries = 0; tries < 400 && trees.length < 70; tries++) {
    const r = Math.sqrt(rand()) * 132, a = rand() * Math.PI * 2
    const x = Math.cos(a) * r, z = Math.sin(a) * r
    if (!free(x, z, 3) || trees.some(t => Math.hypot(t.x - x, t.z - z) < 4)) continue
    const s = 0.9 + rand() * 0.6
    trees.push({ x, z, s })
    add('tree', x, z, 0.7, 0.7, 6)
  }
  for (let tries = 0; tries < 300 && boxes.filter(b => b.kind === 'rock').length < 26; tries++) {
    const r = Math.sqrt(rand()) * 130, a = rand() * Math.PI * 2
    const x = Math.cos(a) * r, z = Math.sin(a) * r
    if (!free(x, z, 3)) continue
    const w = 1.6 + rand() * 1.6
    add('rock', x, z, w, 1.4 + rand() * 1.2, 1.3)
  }
  for (let tries = 0; tries < 300 && boxes.filter(b => b.kind === 'crate').length < 36; tries++) {
    const r = Math.sqrt(rand()) * 130, a = rand() * Math.PI * 2
    const x = Math.cos(a) * r, z = Math.sin(a) * r
    if (!free(x, z, 2)) continue
    add('crate', x, z, 1, 1, 0.9)
    lootSpots.push({ x: x + 1.6, z })
  }
  for (let i = 0; i < 24; i++) {
    const r = Math.sqrt(rand()) * 125, a = rand() * Math.PI * 2
    lootSpots.push({ x: Math.cos(a) * r, z: Math.sin(a) * r })
  }

  return { boxes, buildings, trees, spawns, lootSpots, nextId: id }
}
