import * as THREE from 'three'
import { CAR_W } from './traffic'

const std = (color: THREE.ColorRepresentation, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o })

const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, cast = true) => {
  const o = new THREE.Mesh(g, m)
  o.position.set(x, y, z)
  o.castShadow = cast
  return o
}

// ---------- penguin ----------
export type Hero3D = {
  group: THREE.Group        // place this in the world; faces +x
  body: THREE.Group         // animate: lean, wobble
  flap: (v: number) => void // flippers / legs; ~0 idle, up to ~1.2 flailing
}

const penguinShared = (() => {
  const dark = std(0x1a2433, { roughness: 0.5 })
  const white = std(0xf6f8fb, { roughness: 0.55 })
  const orange = std(0xff9d1c, { roughness: 0.45 })
  const black = std(0x05070a, { roughness: 0.3 })
  const scarf = std(0xe63946, { roughness: 0.7 })
  const sphere = new THREE.SphereGeometry(1, 28, 20)
  const cone = new THREE.ConeGeometry(1, 1, 16)
  const torus = new THREE.TorusGeometry(1, 0.28, 10, 28)
  return { dark, white, orange, black, scarf, sphere, cone, torus }
})()

export const makePenguin = (): Hero3D => {
  const s = penguinShared
  const group = new THREE.Group()
  const body = new THREE.Group()
  group.add(body)

  const sph = (mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
    const m = mesh(s.sphere, mat, x, y, z)
    m.scale.set(sx, sy, sz)
    body.add(m)
    return m
  }

  // torso + belly
  sph(s.dark, 12, 15, 11, 0, 17, 0)
  sph(s.white, 9.6, 12.6, 6.5, 0, 16, 5.4)
  // head + face patches
  sph(s.dark, 9, 8.6, 8.6, 0, 33, 0.6)
  sph(s.white, 4.4, 5.4, 2.6, -3.9, 33.5, 6.1)
  sph(s.white, 4.4, 5.4, 2.6, 3.9, 33.5, 6.1)
  // eyes
  for (const x of [-3.9, 3.9]) {
    sph(s.white, 1.9, 2.3, 1.2, x, 34.6, 8.1)
    sph(s.black, 1.05, 1.35, 0.9, x, 34.4, 8.9)
  }
  // beak
  const beak = mesh(s.cone, s.orange, 0, 31.4, 9.6)
  beak.scale.set(2.6, 5, 1.6)
  beak.rotation.x = Math.PI / 2
  body.add(beak)
  // scarf
  const scarf = mesh(s.torus, s.scarf, 0, 26.2, 0.4)
  scarf.scale.set(8.4, 8.4, 8.4)
  scarf.rotation.x = Math.PI / 2
  body.add(scarf)
  const tail = mesh(s.cone, s.scarf, -4, 24, -3.4)
  tail.scale.set(2.2, 8, 1.4)
  tail.rotation.z = 0.15
  body.add(tail)
  // tail feathers
  const rear = mesh(s.cone, s.dark, 0, 5, -10)
  rear.scale.set(4, 6, 2.5)
  rear.rotation.x = -Math.PI / 2.4
  body.add(rear)

  // flippers
  const flip = (side: number) => {
    const f = mesh(s.sphere, s.dark, side * 12.6, 19, 0.5)
    f.scale.set(2.4, 9.5, 4.6)
    f.rotation.z = side * 0.28
    body.add(f)
    return f
  }
  const flipL = flip(-1)
  const flipR = flip(1)

  // feet
  for (const x of [-5, 5]) {
    const foot = mesh(s.sphere, s.orange, x, 1.4, 4.4)
    foot.scale.set(3.6, 1.5, 6.6)
    group.add(foot)
  }

  body.rotation.order = 'YXZ'
  group.rotation.y = Math.PI / 2   // local +z -> world +x
  const flap = (v: number) => {
    flipL.rotation.z = -0.28 - v
    flipR.rotation.z = 0.28 + v
  }
  return { group, body, flap }
}

// ---------- black sheep ----------
const sheepShared = (() => ({
  wool: new THREE.MeshStandardMaterial({ color: 0x272a33, roughness: 0.95, flatShading: true }),
  skin: std(0x30333c, { roughness: 0.7 }),
  hoof: std(0x0a0a0c, { roughness: 0.6 }),
  horn: std(0xd8b56a, { roughness: 0.5 }),
  white: std(0xf4f4f0, { roughness: 0.4 }),
  amber: std(0xf5b301, { roughness: 0.4 }),
  black: std(0x050505, { roughness: 0.3 }),
  nose: std(0x5a4a52, { roughness: 0.6 }),
  inner: std(0xb98a94, { roughness: 0.7 }),
  puff: new THREE.IcosahedronGeometry(1, 1),
  leg: new THREE.CylinderGeometry(1.7, 1.5, 10, 8),
  hoofGeo: new THREE.CylinderGeometry(1.9, 2, 2.4, 8),
  horn3: new THREE.TorusGeometry(1, 0.26, 8, 20, Math.PI * 1.5),
}))()

export const makeSheep = (): Hero3D => {
  const s = sheepShared
  const p = penguinShared
  const group = new THREE.Group()
  const body = new THREE.Group()
  group.add(body)

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, parent: THREE.Object3D = body) => {
    const o = mesh(geo, mat, x, y, z)
    o.scale.set(sx, sy, sz)
    parent.add(o)
    return o
  }

  // fluffy wool body: a core plus puffs scattered over an ellipsoid
  add(s.puff, s.wool, 12, 11, 15, 0, 17, 0)
  for (let i = 0; i < 22; i++) {
    const phi = Math.acos(1 - (2 * (i + 0.5)) / 22)
    const theta = i * 2.39996
    const r = 6.2 + (i % 3) * 0.9
    add(s.puff, s.wool, r, r, r,
      Math.sin(phi) * Math.cos(theta) * 11.5,
      17 + Math.cos(phi) * 10.5,
      Math.sin(phi) * Math.sin(theta) * 14.5)
  }
  // tail
  add(s.puff, s.wool, 4.4, 4.4, 4.4, 0, 20, -16.5)

  // head, wool fringe, muzzle
  const head = new THREE.Group()
  head.position.set(0, 24, 12.5)
  body.add(head)
  add(p.sphere, s.skin, 7.2, 8, 8.6, 0, 0, 2, head)
  add(s.puff, s.wool, 6.4, 4.4, 5.4, 0, 7.6, 0.4, head)
  add(s.puff, s.wool, 3.4, 3.4, 3.4, -5, 5.6, 1.4, head)
  add(s.puff, s.wool, 3.4, 3.4, 3.4, 5, 5.6, 1.4, head)
  add(p.sphere, s.skin, 4.2, 3.6, 4.6, 0, -3.4, 8.2, head)
  add(p.sphere, s.nose, 2.4, 1.5, 1.2, 0, -2.2, 12.2, head)
  // eyes
  for (const x of [-3.6, 3.6]) {
    add(p.sphere, s.white, 1.9, 2.1, 1.1, x, 1.6, 8.2, head)
    add(p.sphere, s.amber, 1.2, 1.4, 0.9, x, 1.5, 8.9, head)
    add(p.sphere, s.black, 0.55, 1.15, 0.7, x, 1.5, 9.5, head)
  }
  // ears
  for (const side of [-1, 1]) {
    const ear = add(p.sphere, s.skin, 1.6, 2.2, 5.8, side * 8.6, 1.4, 1.4, head)
    ear.rotation.z = side * 0.55
    ear.rotation.y = side * -0.35
    const inner = add(p.sphere, s.inner, 0.7, 1.5, 4.2, side * 8.9, 1.4, 1.8, head)
    inner.rotation.z = side * 0.55
    inner.rotation.y = side * -0.35
    // little curled horn
    const horn = add(s.horn3, s.horn, 3.6, 3.6, 3.6, side * 5.2, 7.4, 0.6, head)
    horn.rotation.set(0, side * Math.PI / 2, side * 0.3)
  }
  // scarf
  const scarf = add(p.torus, p.scarf, 7.6, 7.6, 7.6, 0, 20.4, 9.6)
  scarf.rotation.x = Math.PI / 2 - 0.5

  // legs (pivot at the hip so they can swing)
  const legs: THREE.Group[] = []
  for (const [x, z] of [[-6.5, 8.5], [6.5, 8.5], [-6.5, -8.5], [6.5, -8.5]] as const) {
    const pivot = new THREE.Group()
    pivot.position.set(x, 11, z)
    const leg = mesh(s.leg, s.skin, 0, -5, 0)
    const hoof = mesh(s.hoofGeo, s.hoof, 0, -10.6, 0.3)
    pivot.add(leg, hoof)
    group.add(pivot)
    legs.push(pivot)
  }

  group.rotation.y = Math.PI / 2
  const flap = (v: number) => {
    legs[0].rotation.x = v * 0.6; legs[1].rotation.x = -v * 0.6
    legs[2].rotation.x = -v * 0.6; legs[3].rotation.x = v * 0.6
  }
  return { group, body, flap }
}

// ---------- cars (front points to +z) ----------
type Profile = [number, number][]

const shared = (() => ({
  glass: std(0x14202e, { roughness: 0.08, metalness: 0.6 }),
  tyre: std(0x0d0d0f, { roughness: 0.9 }),
  hub: std(0xb9c2cf, { roughness: 0.25, metalness: 0.8 }),
  head: new THREE.MeshStandardMaterial({ color: 0xfff6cc, emissive: 0xffe9a0, emissiveIntensity: 0.48 }),
  tail: new THREE.MeshStandardMaterial({ color: 0xff2b2b, emissive: 0xff1010, emissiveIntensity: 0.36 }),
  trim: std(0x1b1f27, { roughness: 0.5 }),
  wheel: new THREE.CylinderGeometry(6.6, 6.6, 5, 20),
  hubGeo: new THREE.CylinderGeometry(3.2, 3.2, 5.4, 12),
  box: new THREE.BoxGeometry(1, 1, 1),
}))()

export type CarModel = { group: THREE.Group; wheels: THREE.Group[]; dispose: () => void; tick?: (t: number) => void }

// soft light textures shared by every car
const glow = (() => {
  const dot = document.createElement('canvas')
  dot.width = dot.height = 64
  const d = dot.getContext('2d')!
  const rg = d.createRadialGradient(32, 32, 0, 32, 32, 32)
  rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.35, 'rgba(255,255,255,0.45)'); rg.addColorStop(1, 'rgba(255,255,255,0)')
  d.fillStyle = rg; d.fillRect(0, 0, 64, 64)

  const beam = document.createElement('canvas')
  beam.width = 64; beam.height = 128
  const b = beam.getContext('2d')!
  const lg = b.createLinearGradient(0, 0, 0, 128)          // top = next to the car
  lg.addColorStop(0, 'rgba(255,244,205,0.85)'); lg.addColorStop(1, 'rgba(255,244,205,0)')
  b.fillStyle = lg; b.fillRect(0, 0, 64, 128)
  b.globalCompositeOperation = 'destination-in'            // fade the sides too
  const sg = b.createLinearGradient(0, 0, 64, 0)
  sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(0.25, 'rgba(0,0,0,1)'); sg.addColorStop(0.75, 'rgba(0,0,0,1)'); sg.addColorStop(1, 'rgba(0,0,0,0)')
  b.fillStyle = sg; b.fillRect(0, 0, 64, 128)

  const add = (map: THREE.Texture, color: number) => new THREE.SpriteMaterial({ map, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.3 })
  const dotTex = new THREE.CanvasTexture(dot)
  return {
    head: add(dotTex, 0xfff1c4),
    tail: add(dotTex, 0xff2a20),
    beamMat: new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(beam), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.3 }),
    beamGeo: new THREE.PlaneGeometry(1, 1),
  }
})()

const roofGeos = new Map<string, THREE.BufferGeometry>()

export const makeCar = (len: number, hue: number): CarModel => {
  const s = shared
  const van = len > 100
  // deterministic "random" pick from the hue so a car keeps its type
  const r = ((hue * 9301 + 49297) % 233280) / 233280
  const kind = van ? 'van' : r < 0.14 ? 'taxi' : r < 0.26 ? 'police' : r < 0.5 ? 'suv' : r < 0.68 ? 'sport' : 'sedan'
  const boxy = kind === 'suv'
  const group = new THREE.Group()
  const owned: THREE.Material[] = []

  const paintColor =
    kind === 'taxi' ? new THREE.Color(0xf7c600) :
    kind === 'police' ? new THREE.Color(0xeceff4) :
    new THREE.Color().setHSL(hue / 360, 0.72, kind === 'sport' ? 0.46 : 0.5)
  const paint = std(paintColor, { roughness: 0.28, metalness: 0.4 })
  owned.push(paint)

  const gkey = `${len}-${kind}`
  let geo = roofGeos.get(gkey)
  if (!geo) {
    const L0 = len / 2
    const pts: Profile = van
      ? [[-L0, 2], [-L0, 34], [L0 * 0.2, 36], [L0 * 0.42, 27], [L0, 18], [L0, 2]]
      : boxy
        ? [[-L0, 2], [-L0, 18], [-L0 + 6, 32], [L0 * 0.1, 34], [L0 * 0.3, 27], [L0 - 4, 17], [L0, 12], [L0, 2]]
        : kind === 'sport'
          ? [[-L0, 2], [-L0, 12], [-L0 + 8, 15], [-L0 * 0.25, 17], [-L0 * 0.05, 26], [L0 * 0.2, 26], [L0 * 0.42, 15], [L0, 11], [L0, 2]]
          : [[-L0, 2], [-L0, 14], [-L0 + 8, 17], [-L0 * 0.22, 19], [-L0 * 0.1, 31], [L0 * 0.16, 31], [L0 * 0.3, 19], [L0 - 6, 16], [L0, 11], [L0, 2]]
    const shape = new THREE.Shape()
    pts.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)))
    geo = new THREE.ExtrudeGeometry(shape, { depth: CAR_W - 8, bevelEnabled: true, bevelSize: 3, bevelThickness: 3, bevelSegments: 3 })
    geo.translate(0, 0, -(CAR_W - 8) / 2)
    geo.rotateY(-Math.PI / 2)
    roofGeos.set(gkey, geo)
  }
  group.add(mesh(geo, paint, 0, 0, 0))

  const L = len / 2
  const box = (mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, cast = false) => {
    const o = mesh(s.box, mat, x, y, z, cast)
    o.scale.set(w, h, d)
    group.add(o)
    return o
  }

  // glass
  const top = van ? 26 : boxy ? 27 : kind === 'sport' ? 21 : 25
  if (van) {
    box(s.glass, CAR_W - 3, 9, len * 0.22, 0, top, L * 0.5)
    box(s.glass, CAR_W - 10, 10, 1.2, 0, top, L * 0.72).rotation.x = -0.5
  } else {
    box(s.glass, CAR_W - 3.5, kind === 'sport' ? 6 : 9, len * (boxy ? 0.4 : 0.3), 0, top, boxy ? -L * 0.08 : L * 0.02)
    box(s.glass, CAR_W - 12, kind === 'sport' ? 8 : 11, 1.2, 0, top - 1, boxy ? L * 0.22 : L * 0.26).rotation.x = -0.72
    box(s.glass, CAR_W - 12, 9, 1.2, 0, top - 1, -L * (boxy ? 0.36 : 0.29)).rotation.x = boxy ? 0.15 : 0.6
  }

  // door seams, handles and mirrors on both sides
  const seam = std(0x0d0f14, { roughness: 0.7 }); owned.push(seam)
  const chrome = std(0xc8d0dc, { roughness: 0.2, metalness: 0.9 }); owned.push(chrome)
  for (const side of [-1, 1]) {
    const x = side * (CAR_W / 2 - 0.9)
    if (!van) {
      box(seam, 0.6, 12, 0.5, x, 15, L * 0.18)
      box(seam, 0.6, 12, 0.5, x, 15, -L * 0.2)
      box(chrome, 0.9, 1.1, 4, x + side * 0.2, 20, L * 0.05)
      box(paint, 3.4, 3, 4.6, side * (CAR_W / 2 + 1.6), 22, L * 0.24)       // mirror
    } else {
      box(seam, 0.6, 24, 0.5, x, 18, L * 0.22)
      box(paint, 3.4, 4, 5, side * (CAR_W / 2 + 1.6), 24, L * 0.72)
    }
  }

  // lights, grille, bumpers, plates
  for (const x of [-CAR_W / 2 + 8, CAR_W / 2 - 8]) {
    box(s.head, 8, 3.6, 1.6, x, 9, L + 0.6)
    box(s.tail, 8, 3.6, 1.6, x, 9.5, -L - 0.6)
    const hs = new THREE.Sprite(glow.head); hs.scale.set(20, 20, 1); hs.position.set(x, 9, L + 3); group.add(hs)
    const ts = new THREE.Sprite(glow.tail); ts.scale.set(15, 15, 1); ts.position.set(x, 9.5, -L - 3); group.add(ts)
  }
  box(s.trim, 16, 3.2, 1.4, 0, 6.5, L + 0.4)
  box(s.trim, CAR_W - 2, 3.4, 2.4, 0, 3.2, L + 0.8, true)
  box(s.trim, CAR_W - 2, 3.4, 2.4, 0, 3.2, -L - 0.8, true)
  const plate = std(0xf1ede0, { roughness: 0.5 }); owned.push(plate)
  box(plate, 9, 3.6, 0.5, 0, 6, L + 1.9)
  box(plate, 9, 3.6, 0.5, 0, 7, -L - 1.9)

  // headlight beams on the road ahead
  const beam = new THREE.Mesh(glow.beamGeo, glow.beamMat)
  beam.scale.set(CAR_W + 10, 90, 1)
  beam.rotation.x = -Math.PI / 2
  beam.position.set(0, 0.6, L + 46)
  beam.renderOrder = 2
  group.add(beam)

  // roof extras
  let tick: ((t: number) => void) | undefined
  if (kind === 'taxi') {
    const signMat = new THREE.MeshStandardMaterial({ color: 0xfff3b0, emissive: 0xffd84a, emissiveIntensity: 0.33 })
    owned.push(signMat)
    box(signMat, 14, 4.4, 6, 0, top + 8, -L * 0.04, true)
  } else if (kind === 'police') {
    box(seam, CAR_W - 4, 2.6, len * 0.42, 0, 9, -L * 0.02)                        // dark side stripe
    const red = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 0.06 })
    const blue = new THREE.MeshStandardMaterial({ color: 0x2a5bff, emissive: 0x1030ff, emissiveIntensity: 0.06 })
    owned.push(red, blue)
    box(seam, 22, 2, 7, 0, top + 6.6, -L * 0.04)
    box(red, 9, 3.4, 6, -5.5, top + 8.6, -L * 0.04)
    box(blue, 9, 3.4, 6, 5.5, top + 8.6, -L * 0.04)
    tick = (t: number) => {
      const on = Math.floor(t * 6) % 2 === 0
      red.emissiveIntensity = on ? 0.78 : 0.05
      blue.emissiveIntensity = on ? 0.05 : 0.78
    }
  } else if (kind === 'sport') {
    box(paint, CAR_W - 8, 1.6, 7, 0, 17.5, -L + 1.5, true)                       // spoiler wing
    box(seam, 1.6, 4, 2, -CAR_W / 2 + 9, 15.5, -L + 2)
    box(seam, 1.6, 4, 2, CAR_W / 2 - 9, 15.5, -L + 2)
  } else if (kind === 'suv' || van) {
    const ry = van ? 37.5 : 35.5
    for (const x of [-CAR_W / 2 + 8, CAR_W / 2 - 8]) box(seam, 1.2, 1.2, len * 0.36, x, ry, -L * 0.05)
    box(seam, CAR_W - 14, 1.2, 1.2, 0, ry, -L * 0.2)
    box(seam, CAR_W - 14, 1.2, 1.2, 0, ry, L * 0.1)
  }

  // wheels with arches
  const wheels: THREE.Group[] = []
  const arch = std(0x08090c, { roughness: 0.9 }); owned.push(arch)
  for (const z of [L * 0.62, -L * 0.62]) {
    for (const side of [-1, 1]) {
      const w = new THREE.Group()
      const tyre = mesh(s.wheel, s.tyre, 0, 0, 0)
      tyre.rotation.z = Math.PI / 2
      const hub = mesh(s.hubGeo, s.hub, 0, 0, 0, false)
      hub.rotation.z = Math.PI / 2
      w.add(tyre, hub)
      w.position.set(side * (CAR_W / 2 - 1), 6.6, z)
      group.add(w)
      wheels.push(w)
      const ar = mesh(s.wheel, arch, side * (CAR_W / 2 - 0.4), 6.8, z, false)
      ar.scale.set(1.28, 0.16, 1.28)
      ar.rotation.z = Math.PI / 2
      group.add(ar)
    }
  }

  return { group, wheels, tick, dispose: () => owned.forEach(o => o.dispose()) }
}

// ---------- text / emoji sprites ----------
const tex = new Map<string, THREE.CanvasTexture>()
export const textTexture = (text: string, color: string, font = '800 44px Manrope, sans-serif', w = 256, h = 64) => {
  const key = `${text}|${color}|${font}`
  let t = tex.get(key)
  if (!t) {
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const g = c.getContext('2d')!
    g.font = font
    g.textAlign = 'center'; g.textBaseline = 'middle'
    g.lineWidth = 8; g.lineJoin = 'round'; g.strokeStyle = 'rgba(0,0,0,0.6)'
    g.strokeText(text, w / 2, h / 2 + 2)
    g.fillStyle = color
    g.fillText(text, w / 2, h / 2 + 2)
    t = new THREE.CanvasTexture(c)
    tex.set(key, t)
  }
  return t
}

export const emojiSprite = (emoji: string) => {
  const t = textTexture(emoji, '#ffffff', '84px "Segoe UI Emoji", "Apple Color Emoji", sans-serif', 128, 128)
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true }))
  s.scale.set(42, 42, 1)
  s.center.set(0.5, 0.1)
  return s
}

export const disposeTextures = () => { tex.forEach(t => t.dispose()); tex.clear() }
