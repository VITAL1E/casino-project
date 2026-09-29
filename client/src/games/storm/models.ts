import * as THREE from 'three'
import type { LootKind, WeaponKey } from './engine'

const std = (color: THREE.ColorRepresentation, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o })

const sh = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(1, 20, 14),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  cone: new THREE.ConeGeometry(1, 1, 10),
  ico: new THREE.IcosahedronGeometry(1, 1),
  dodeca: new THREE.DodecahedronGeometry(1, 0),
}

const mesh = (g: THREE.BufferGeometry, m: THREE.Material, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0, cast = true) => {
  const o = new THREE.Mesh(g, m)
  o.scale.set(sx, sy, sz)
  o.position.set(x, y, z)
  o.castShadow = cast
  return o
}

// ---------- guns (barrel points to +z, origin at the grip) ----------
const gunMats = {
  dark: std(0x1c1f26, { roughness: 0.4, metalness: 0.6 }),
  metal: std(0x8a93a3, { roughness: 0.3, metalness: 0.8 }),
  wood: std(0x7a4a26, { roughness: 0.75 }),
  glass: std(0x62d0ff, { roughness: 0.1, metalness: 0.2, emissive: 0x1a6fa0, emissiveIntensity: 0.6 }),
}

export const WEAPON_COLOR: Record<WeaponKey, number> = { pistol: 0xbfc5cf, ar: 0x4aa8ff, shotgun: 0xb45cff, sniper: 0xffb020 }

export const makeGun = (key: WeaponKey) => {
  const g = new THREE.Group()
  const m = gunMats
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number) =>
    g.add(mesh(geo, mat, sx, sy, sz, x, y, z))
  if (key === 'pistol') {
    add(sh.box, m.dark, 0.07, 0.11, 0.3, 0, 0.02, 0.15)
    add(sh.box, m.metal, 0.06, 0.05, 0.3, 0, 0.09, 0.15)
    add(sh.box, m.dark, 0.06, 0.16, 0.08, 0, -0.08, 0.02)
  } else if (key === 'ar') {
    add(sh.box, m.dark, 0.09, 0.13, 0.62, 0, 0.02, 0.28)
    add(sh.cyl, m.metal, 0.022, 0.4, 0.022, 0, 0.03, 0.78).rotation.x = Math.PI / 2
    add(sh.box, m.dark, 0.07, 0.2, 0.1, 0, -0.14, 0.32)
    add(sh.box, m.dark, 0.08, 0.12, 0.3, 0, 0.0, -0.18)
    add(sh.box, m.metal, 0.05, 0.05, 0.16, 0, 0.11, 0.3)
    add(sh.box, m.dark, 0.05, 0.14, 0.07, 0, -0.1, 0.02)
  } else if (key === 'shotgun') {
    add(sh.box, m.wood, 0.1, 0.11, 0.38, 0, 0, -0.1)
    add(sh.cyl, m.metal, 0.034, 0.75, 0.034, 0, 0.03, 0.48).rotation.x = Math.PI / 2
    add(sh.box, m.wood, 0.085, 0.09, 0.26, 0, -0.03, 0.55)
    add(sh.box, m.dark, 0.05, 0.14, 0.07, 0, -0.1, 0.05)
  } else {
    add(sh.box, m.dark, 0.08, 0.11, 0.9, 0, 0.02, 0.35)
    add(sh.cyl, m.metal, 0.024, 0.5, 0.024, 0, 0.03, 1.05).rotation.x = Math.PI / 2
    add(sh.cyl, m.dark, 0.05, 0.3, 0.05, 0, 0.13, 0.36).rotation.x = Math.PI / 2
    add(sh.sphere, m.glass, 0.048, 0.048, 0.02, 0, 0.13, 0.52)
    add(sh.box, m.dark, 0.08, 0.14, 0.32, 0, -0.02, -0.28)
    add(sh.box, m.dark, 0.05, 0.14, 0.07, 0, -0.1, 0.05)
  }
  return g
}

// ---------- soldier ----------
export type Soldier = {
  group: THREE.Group
  hip: THREE.Group           // leaves the feet on the floor, tilts when hit
  legL: THREE.Group
  legR: THREE.Group
  armPivot: THREE.Group
  guns: Record<WeaponKey, THREE.Group>
  gunPivot: THREE.Group
  setWeapon: (k: WeaponKey) => void
  dispose: () => void
}

const skin = std(0xe0b48e, { roughness: 0.6 })
const pantsMat = std(0x232a36)
const boot = std(0x15161a)
const visor = std(0x10141c, { roughness: 0.15, metalness: 0.6 })

export const makeSoldier = (hue: number, human: boolean): Soldier => {
  const shirt = std(new THREE.Color().setHSL(hue / 360, 0.65, 0.5))
  const vest = std(new THREE.Color().setHSL(hue / 360, 0.45, 0.28))
  const helm = std(new THREE.Color().setHSL(hue / 360, 0.7, human ? 0.62 : 0.4), { roughness: 0.4, metalness: 0.3 })

  const group = new THREE.Group()
  const hip = new THREE.Group()
  group.add(hip)

  hip.add(mesh(sh.box, shirt, 0.6, 0.66, 0.34, 0, 1.2, 0))
  hip.add(mesh(sh.box, vest, 0.62, 0.42, 0.36, 0, 1.28, 0.02))
  hip.add(mesh(sh.box, vest, 0.44, 0.5, 0.2, 0, 1.25, -0.27))            // backpack
  hip.add(mesh(sh.box, pantsMat, 0.5, 0.2, 0.3, 0, 0.9, 0))
  hip.add(mesh(sh.cyl, skin, 0.07, 0.1, 0.07, 0, 1.6, 0))
  hip.add(mesh(sh.sphere, skin, 0.17, 0.18, 0.17, 0, 1.75, 0))
  hip.add(mesh(sh.sphere, helm, 0.2, 0.15, 0.2, 0, 1.83, -0.01))          // helmet
  hip.add(mesh(sh.box, visor, 0.26, 0.07, 0.1, 0, 1.76, 0.15))

  const legs: THREE.Group[] = []
  for (const x of [-0.14, 0.14]) {
    const leg = new THREE.Group()
    leg.position.set(x, 0.85, 0)
    leg.add(mesh(sh.box, pantsMat, 0.22, 0.8, 0.26, 0, -0.4, 0))
    leg.add(mesh(sh.box, boot, 0.24, 0.14, 0.34, 0, -0.78, 0.04))
    hip.add(leg)
    legs.push(leg)
  }

  // both hands on the gun, rotated together with the aim
  const gunPivot = new THREE.Group()
  gunPivot.position.set(0.05, 1.32, 0.12)
  hip.add(gunPivot)
  const armPivot = new THREE.Group()
  armPivot.position.set(0, 1.4, 0.05)
  hip.add(armPivot)
  for (const [x, len, ang] of [[0.32, 0.6, 0.35], [-0.32, 0.55, -0.5]] as const) {
    const arm = new THREE.Group()
    arm.position.set(x, 0, 0)
    arm.rotation.z = -Math.sign(x) * 0.0
    arm.add(mesh(sh.box, shirt, 0.15, len, 0.15, 0, -len / 2, 0))
    arm.add(mesh(sh.box, skin, 0.13, 0.13, 0.13, 0, -len - 0.04, 0))
    arm.rotation.y = ang * 0.35
    armPivot.add(arm)
  }
  armPivot.rotation.x = -Math.PI / 2

  const guns = { pistol: makeGun('pistol'), ar: makeGun('ar'), shotgun: makeGun('shotgun'), sniper: makeGun('sniper') }
  ;(Object.values(guns) as THREE.Group[]).forEach(g => { g.visible = false; g.position.set(0, -0.05, 0.25); gunPivot.add(g) })
  guns.pistol.visible = true

  group.rotation.order = 'YXZ'
  return {
    group, hip, legL: legs[0], legR: legs[1], armPivot, guns, gunPivot,
    setWeapon: k => { (Object.keys(guns) as WeaponKey[]).forEach(w => { guns[w].visible = w === k }) },
    dispose: () => { shirt.dispose(); vest.dispose(); helm.dispose() },
  }
}

// ---------- props ----------
const treeTrunk = std(0x6b4a2f, { roughness: 0.9 })
const treeLeaf = std(0x2f8a3e, { roughness: 0.85, flatShading: true })
const treeLeaf2 = std(0x3fa14c, { roughness: 0.85, flatShading: true })
export const makeTree = (s: number) => {
  const g = new THREE.Group()
  g.add(mesh(sh.cyl, treeTrunk, 0.32 * s, 3 * s, 0.32 * s, 0, 1.5 * s, 0))
  g.add(mesh(sh.cone, treeLeaf, 1.9 * s, 3 * s, 1.9 * s, 0, 3.6 * s, 0))
  g.add(mesh(sh.cone, treeLeaf2, 1.5 * s, 2.5 * s, 1.5 * s, 0, 5.1 * s, 0))
  return g
}

const rockMat = std(0x8b8f99, { roughness: 0.95, flatShading: true })
export const makeRock = (w: number, d: number, h: number) => {
  const m = mesh(sh.dodeca, rockMat, w * 0.62, h * 0.85, d * 0.62, 0, h * 0.35, 0)
  m.rotation.y = w * 7
  return m
}

const crateMat = std(0xb07a3f, { roughness: 0.8 })
const crateTrim = std(0x6a4522, { roughness: 0.8 })
export const makeCrate = (h: number) => {
  const g = new THREE.Group()
  g.add(mesh(sh.box, crateMat, 1, h, 1, 0, h / 2, 0))
  for (const y of [0.05, h - 0.05]) g.add(mesh(sh.box, crateTrim, 1.04, 0.1, 1.04, 0, y, 0))
  for (const [x, z] of [[-0.47, -0.47], [0.47, -0.47], [-0.47, 0.47], [0.47, 0.47]]) g.add(mesh(sh.box, crateTrim, 0.1, h, 0.1, x, h / 2, z))
  return g
}

const wallMat = std(0xeee4d2, { roughness: 0.9 })
const wallTrim = std(0x8f8676, { roughness: 0.9 })
export const makeWall = (w: number, d: number, h: number) => {
  const g = new THREE.Group()
  g.add(mesh(sh.box, wallMat, w, h, d, 0, h / 2, 0))
  g.add(mesh(sh.box, wallTrim, w + 0.08, 0.3, d + 0.08, 0, 0.15, 0))
  g.add(mesh(sh.box, wallTrim, w + 0.1, 0.16, d + 0.1, 0, h + 0.02, 0))
  return g
}

const planks = (() => {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = '#c69a5e'; g.fillRect(0, 0, 64, 64)
  g.fillStyle = '#9b7238'
  for (let i = 0; i < 4; i++) g.fillRect(0, i * 16, 64, 2)
  g.fillStyle = 'rgba(0,0,0,0.12)'
  for (let i = 0; i < 6; i++) g.fillRect((i * 23) % 64, (i * 11) % 60, 2, 12)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
})()
export const buildMat = new THREE.MeshStandardMaterial({ map: planks, roughness: 0.8, color: 0xffffff })
export const makeBuilt = (w: number, d: number, h: number) => {
  const g = new THREE.Group()
  const m = mesh(sh.box, buildMat, w, h, d, 0, h / 2, 0)
  g.add(m)
  const frame = std(0x5b3d1c, { roughness: 0.8 })
  g.add(mesh(sh.box, frame, w + 0.06, 0.18, d + 0.06, 0, 0.09, 0))
  g.add(mesh(sh.box, frame, w + 0.06, 0.18, d + 0.06, 0, h - 0.09, 0))
  g.add(mesh(sh.box, frame, w > d ? 0.18 : w + 0.06, h, w > d ? d + 0.06 : 0.18, w > d ? -w / 2 + 0.09 : 0, h / 2, w > d ? 0 : -d / 2 + 0.09))
  g.add(mesh(sh.box, frame, w > d ? 0.18 : w + 0.06, h, w > d ? d + 0.06 : 0.18, w > d ? w / 2 - 0.09 : 0, h / 2, w > d ? 0 : d / 2 - 0.09))
  return g
}

// ---------- loot ----------
export const LOOT_COLOR: Record<LootKind, number> = {
  pistol: 0xbfc5cf, ar: 0x4aa8ff, shotgun: 0xb45cff, sniper: 0xffb020, shield: 0x3ddcff, med: 0x4be07a, mats: 0xc69a5e,
}

const beamMats = new Map<number, THREE.MeshBasicMaterial>()
const beamGeo = new THREE.CylinderGeometry(0.35, 0.35, 5, 12, 1, true)
export const makeLoot = (kind: LootKind) => {
  const g = new THREE.Group()
  const color = LOOT_COLOR[kind]
  let bm = beamMats.get(color)
  if (!bm) {
    bm = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    beamMats.set(color, bm)
  }
  const beam = new THREE.Mesh(beamGeo, bm)
  beam.position.y = 2.5
  g.add(beam)

  const item = new THREE.Group()
  item.position.y = 0.9
  if (kind === 'ar' || kind === 'shotgun' || kind === 'sniper') {
    const gun = makeGun(kind)
    gun.scale.setScalar(1.6)
    gun.position.z = -0.4
    item.add(gun)
  } else if (kind === 'shield') {
    item.add(mesh(sh.sphere, std(color, { emissive: color, emissiveIntensity: 0.5, roughness: 0.2 }), 0.28, 0.34, 0.28))
    item.add(mesh(sh.cyl, std(0xdfe8f4), 0.1, 0.16, 0.1, 0, 0.38, 0))
  } else if (kind === 'med') {
    item.add(mesh(sh.box, std(0xf2f4f8), 0.5, 0.36, 0.3))
    item.add(mesh(sh.box, std(color, { emissive: color, emissiveIntensity: 0.4 }), 0.34, 0.1, 0.32))
    item.add(mesh(sh.box, std(color, { emissive: color, emissiveIntensity: 0.4 }), 0.1, 0.3, 0.32))
  } else {
    item.add(mesh(sh.box, crateMat, 0.5, 0.4, 0.5))
    item.add(mesh(sh.box, crateTrim, 0.54, 0.08, 0.54, 0, 0.18, 0))
  }
  g.add(item)
  return { group: g, item }
}
