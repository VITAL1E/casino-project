import * as THREE from 'three'
import NetShell, { type NetAdapter } from '../net/NetShell'
import { setTarget, easeToTargets } from '../net/smooth'
import {
  rayCast, eyeOf, stormRadius, WEAPONS, ROUND_SEC, PLAYERS, MAP_R,
  type World, type Player, type GameEvent, type WeaponKey,
} from './engine'
import { genMap, mulberry32, type Box } from './map'
import type { StormInit, StormSnap } from './net'
import { makeSoldier, makeTree, makeRock, makeCrate, makeWall, makeBuilt, makeLoot, WEAPON_COLOR, type Soldier } from './models'

type Feed = { id: number; text: string; at: number }
type StormUi = {
  t: number; alive: number; kills: number; hp: number; shield: number; mats: number
  weapons: WeaponKey[]; slot: number; me: boolean; stormIn: number; inStorm: boolean
  hitFlash: boolean; flash: boolean; locked: boolean; feed: Feed[]
}

const cssVar = (el: Element, name: string) => getComputedStyle(el).getPropertyValue(name).trim()
const CAM_DIST = 4.2

// input / view state shared with the render loop (module level: one Storm stage exists at a time)
const flash = { current: 0 }
const hitmark = { current: 0 }
const view = { current: { yaw: 0, pitch: 0.1 } }
const inp = { current: { keys: new Set<string>(), fire: false, jump: false, build: false, slot: undefined as number | undefined, locked: false } }

const grab = () => {
  const dom = document.querySelector('.st-stage canvas.sl-canvas') as HTMLCanvasElement | null
  dom?.requestPointerLock?.()
}

const StormHud = ({ ui, timeLeft, pool }: { ui: StormUi; timeLeft: number; pool: number }) => {
  const stormR = stormRadius(ui.t)
  return (
    <>
      <div className="sl-hud sl-hud--tl">
        <div className="sl-chip"><span>Time</span><b>{timeLeft}s</b></div>
        <div className="sl-chip"><span>Alive</span><b>{ui.alive}/{PLAYERS}</b></div>
        <div className="sl-chip"><span>Kills</span><b>{ui.kills}</b></div>
        <div className="sl-chip"><span>Pool</span><b>{pool.toFixed(2)}</b></div>
      </div>

      <div className={`st-storm${ui.inStorm ? ' st-storm--in' : ''}`}>
        {ui.inStorm ? 'YOU ARE IN THE STORM' : ui.stormIn > 0 ? `Storm forms in ${Math.ceil(ui.stormIn)}s` : `Safe zone ${Math.round(stormR)}m`}
      </div>

      <div className="st-feed">
        {ui.feed.map(f => <div key={f.id}>{f.text}</div>)}
      </div>

      <canvas className="st-mini" width={150} height={150} />

      <div className="st-bars">
        <div className="st-bar st-bar--shield"><i style={{ width: `${ui.shield}%` }} /></div>
        <div className="st-bar st-bar--hp"><i style={{ width: `${ui.hp}%` }} /></div>
        <small>{Math.ceil(ui.hp)} HP · {Math.ceil(ui.shield)} shield · {ui.mats} wood</small>
      </div>

      <div className="st-slots">
        {ui.weapons.map((k, i) => (
          <div key={k} className={`st-slot${i === ui.slot ? ' st-slot--on' : ''}`} style={{ borderColor: i === ui.slot ? `#${WEAPON_COLOR[k].toString(16).padStart(6, '0')}` : undefined }}>
            <b>{i + 1}</b>{WEAPONS[k].name}
          </div>
        ))}
      </div>

      {ui.me && <div className="st-cross" />}
      {ui.hitFlash && <div className="st-hit" />}
      {ui.flash && <div className="st-flash" />}
      {ui.inStorm && <div className="st-flash st-flash--storm" />}

      {ui.me && !ui.locked && (
        <button className="st-lock" onClick={grab}>
          <b>Click to play</b>
          <span>WASD move · Mouse aim & shoot · Space jump · Shift run · F build wall · 1–4 weapons</span>
        </button>
      )}
      {!ui.me && (
        <div className="sl-hud sl-hud--bottom">
          <small>You were eliminated — watching until the match ends</small>
        </div>
      )}
    </>
  )
}

// Built walls are delta-encoded by id; the static map is rebuilt from the seed.
const adapter: NetAdapter<World, StormSnap, StormInit> = {
  key: 'storm',
  title: 'Storm Royale',
  blurb: 'Third-person battle royale. Loot weapons, build walls for cover, and outlast the field while the storm closes in. WASD move · Mouse aim · Click shoot · Space jump · Shift run · F build a wall · 1–4 / wheel weapons. Desktop only.',
  roundSec: ROUND_SEC,
  stageClass: 'st-stage',

  create: (you, seats, init) => {
    const map = genMap(mulberry32(init.seed), PLAYERS)
    const players: Player[] = seats.map((s, i) => ({
      id: s.id, name: s.name, hue: s.hue, human: s.id === you, auto: false,
      x: map.spawns[i].x, y: 0, z: map.spawns[i].z, vy: 0, yaw: 0, pitch: 0, moveX: 0, moveZ: 0,
      hp: 100, shield: 0, mats: 100, weapons: ['pistol'], slot: 0, cooldown: 0, buildCd: 0,
      alive: true, kills: 0, place: 0, fire: false, hurtT: 0, lastShot: -9,
      think: 0, target: -1, seen: 0, strafe: 1, strafeT: 1, stuckT: 0, px: 0, pz: 0, skill: 0, goalX: 0, goalZ: 0, jumpT: 0,
    }))
    return { t: 0, seed: init.seed, map, players, loot: [], events: [], lootTimer: 0, lootId: 0, rand: Math.random, over: false, winner: -1 }
  },

  apply: (w, snap) => {
    w.t = snap.t
    for (const s of snap.players) {
      const p = w.players[s.id]
      setTarget(p, s.x, s.y, s.z)
      p.yaw = s.yaw; p.pitch = s.pitch; p.hp = s.hp; p.shield = s.shield; p.mats = s.mats
      p.weapons = s.weapons; p.slot = s.slot; p.alive = s.al; p.kills = s.k; p.place = s.p; p.lastShot = s.lastShot
    }
    const lootDel = new Set(snap.lootDel)
    w.loot = w.loot.filter(l => !lootDel.has(l.id))
    for (const [id, x, z, kind] of snap.lootAdd) if (!w.loot.some(l => l.id === id)) w.loot.push({ id, x, z, kind })
    const buildDel = new Set(snap.buildDel)
    w.map.boxes = w.map.boxes.filter(b => !buildDel.has(b.id))
    for (const [id, x, z, bw, d, h, owner] of snap.buildAdd) {
      if (w.map.boxes.some(b => b.id === id)) continue
      const box: Box = { id, kind: 'build', x, z, w: bw, d, h, hp: 1, owner, born: w.t }
      w.map.boxes.push(box)
    }
    w.events.push(...snap.events)   // consumed (and cleared) by the render loop
  },

  hud: w => {
    const me = w.players.find(p => p.human)!
    return { t: w.t, chips: [], board: [], note: '', me: me.alive }
  },

  overlay: ({ ui, timeLeft, pool }) => (ui ? <StormHud ui={ui as StormUi} timeLeft={timeLeft} pool={pool} /> : null),

  mount: (wrap, api) => {
    const w = api.world()
    const me = w.players.find(p => p.human)!
    view.current = { yaw: me.yaw, pitch: 0.12 }
    const uiState = { locked: false, feed: [] as Feed[] }

    // ---------- renderer / scene ----------
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    const dom = renderer.domElement
    dom.className = 'sl-canvas'
    wrap.prepend(dom)

    const sky = new THREE.Color(0x9fd0ff)
    const scene = new THREE.Scene()
    scene.background = sky
    scene.fog = new THREE.Fog(sky, 90, 300)
    const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 600)

    const resize = () => {
      const W = wrap.clientWidth, H = wrap.clientHeight
      renderer.setSize(W, H)
      camera.aspect = W / H
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x6b8a55, 1.9))
    const sun = new THREE.DirectionalLight(0xfff2d8, 2.1)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 300 })
    sun.shadow.bias = -0.0005
    scene.add(sun, sun.target)

    // ground, sand and sea
    const grassTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 128
      const g = c.getContext('2d')!
      g.fillStyle = '#5da84a'; g.fillRect(0, 0, 128, 128)
      for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${40 + Math.random() * 40},${110 + Math.random() * 60},${40 + Math.random() * 30},0.35)`; g.fillRect(Math.random() * 128, Math.random() * 128, 3 + Math.random() * 5, 3 + Math.random() * 5) }
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(60, 60)
      return t
    })()
    const ground = new THREE.Mesh(new THREE.CircleGeometry(MAP_R + 12, 72), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }))
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)
    const sand = new THREE.Mesh(new THREE.RingGeometry(MAP_R + 12, MAP_R + 24, 72), new THREE.MeshStandardMaterial({ color: 0xe3cf94, roughness: 1 }))
    sand.rotation.x = -Math.PI / 2; sand.position.y = 0.005
    scene.add(sand)
    const sea = new THREE.Mesh(new THREE.CircleGeometry(700, 48), new THREE.MeshStandardMaterial({ color: 0x2b7fd4, roughness: 0.3 }))
    sea.rotation.x = -Math.PI / 2; sea.position.y = -0.4
    scene.add(sea)

    // ---------- static world ----------
    const meshes = new Map<number, THREE.Object3D>()
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xb89a6a, roughness: 0.9 })
    for (const b of w.map.buildings) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.06, b.d), floorMat)
      f.position.set(b.cx, 0.03, b.cz); f.receiveShadow = true
      scene.add(f)
    }
    for (const t of w.map.trees) {
      const g = makeTree(t.s); g.position.set(t.x, 0, t.z); g.rotation.y = t.x
      scene.add(g)
    }
    const addBox = (b: (typeof w.map.boxes)[number], grow: boolean) => {
      let g: THREE.Object3D | null = null
      if (b.kind === 'wall') g = makeWall(b.w, b.d, b.h)
      else if (b.kind === 'rock') g = makeRock(b.w, b.d, b.h)
      else if (b.kind === 'crate') g = makeCrate(b.h)
      else if (b.kind === 'build') g = makeBuilt(b.w, b.d, b.h)
      if (!g) return
      g.position.set(b.x, 0, b.z)
      if (grow) g.scale.y = 0.01
      scene.add(g)
      meshes.set(b.id, g)
    }
    w.map.boxes.forEach(b => addBox(b, false))

    // storm
    const stormMat = new THREE.MeshBasicMaterial({ color: 0x8b3dff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
    const stormWall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 500, 96, 1, true), stormMat)
    stormWall.position.y = 250
    scene.add(stormWall)
    const stormFloor = new THREE.Mesh(new THREE.RingGeometry(1, 14, 96), new THREE.MeshBasicMaterial({ color: 0x6a1fd0, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }))
    stormFloor.rotation.x = -Math.PI / 2; stormFloor.position.y = 0.08
    scene.add(stormFloor)

    // ---------- soldiers ----------
    const labelTex = new Map<string, THREE.CanvasTexture>()
    const label = (text: string, color: string) => {
      const key = text + color
      let t = labelTex.get(key)
      if (!t) {
        const c = document.createElement('canvas'); c.width = 256; c.height = 64
        const g = c.getContext('2d')!
        g.font = '800 40px Manrope, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
        g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineJoin = 'round'
        g.strokeText(text, 128, 34); g.fillStyle = color; g.fillText(text, 128, 34)
        t = new THREE.CanvasTexture(c); labelTex.set(key, t)
      }
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true }))
      return s
    }
    const accent = cssVar(wrap, '--accent-bright') || '#7db8fb'
    const whiteC = cssVar(wrap, '--white') || '#e8edf5'
    const yellowC = cssVar(wrap, '--yellow') || '#facc15'

    const soldiers: Soldier[] = w.players.map(p => {
      const s = makeSoldier(p.hue, p.human)
      const tag = label(p.name, p.human ? accent : whiteC)
      tag.scale.set(1.6, 0.4, 1); tag.position.y = 2.35
      s.group.add(tag)
      scene.add(s.group)
      return s
    })
    const phase0 = w.players.map(() => 0)
    const prevPos = w.players.map(p => new THREE.Vector3(p.x, p.y, p.z))

    // ---------- loot ----------
    const lootMeshes = new Map<number, ReturnType<typeof makeLoot>>()

    // ---------- effects ----------
    type Fx = { obj: THREE.Object3D; vx: number; vy: number; vz: number; life: number; max: number; kind: 'bit' | 'tracer' | 'text' | 'flash'; grav: number }
    const fx: Fx[] = []
    const bitGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12)
    const bitMats = new Map<number, THREE.MeshBasicMaterial>()
    const bitMat = (c: number) => { let m = bitMats.get(c); if (!m) { m = new THREE.MeshBasicMaterial({ color: c }); bitMats.set(c, m) } return m }
    const burst = (x: number, y: number, z: number, color: number, n: number, power: number) => {
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(bitGeo, bitMat(color))
        m.position.set(x, y, z); m.scale.setScalar(0.5 + Math.random())
        scene.add(m)
        const a = Math.random() * Math.PI * 2, sp = power * (0.3 + Math.random())
        fx.push({ obj: m, vx: Math.cos(a) * sp, vy: 1 + Math.random() * power, vz: Math.sin(a) * sp, life: 0.6, max: 0.6, kind: 'bit', grav: 14 })
      }
    }
    const tracerGeo = new THREE.CylinderGeometry(0.018, 0.018, 1, 5)
    const tracerMat = new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
    const flashTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64
      const g = c.getContext('2d')!
      const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32)
      rg.addColorStop(0, 'rgba(255,240,180,1)'); rg.addColorStop(1, 'rgba(255,160,40,0)')
      g.fillStyle = rg; g.fillRect(0, 0, 64, 64)
      return new THREE.CanvasTexture(c)
    })()
    const pop = (x: number, y: number, z: number, text: string, color: string, size: number) => {
      const s = label(text, color)
      s.scale.set(size * 4, size, 1); s.position.set(x, y, z)
      scene.add(s)
      fx.push({ obj: s, vx: 0, vy: 2, vz: 0, life: 0.8, max: 0.8, kind: 'text', grav: 0 })
    }

    let feedId = 0
    const feedLog: Feed[] = []
    const onEvent = (e: GameEvent) => {
      switch (e.type) {
        case 'shot': {
          const a = new THREE.Vector3(...e.from), b = new THREE.Vector3(...e.to)
          if (a.distanceTo(camera.position) > 160) break
          const len = a.distanceTo(b)
          const m = new THREE.Mesh(tracerGeo, tracerMat)
          m.position.copy(a).lerp(b, 0.5)
          m.scale.set(e.owner === me.id ? 1.6 : 1, len, e.owner === me.id ? 1.6 : 1)
          m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
          scene.add(m)
          fx.push({ obj: m, vx: 0, vy: 0, vz: 0, life: 0.07, max: 0.07, kind: 'tracer', grav: 0 })
          const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }))
          f.position.copy(a); f.scale.setScalar(e.weapon === 'shotgun' ? 1.1 : 0.7)
          scene.add(f)
          fx.push({ obj: f, vx: 0, vy: 0, vz: 0, life: 0.06, max: 0.06, kind: 'flash', grav: 0 })
          break
        }
        case 'impact': burst(e.x, e.y, e.z, 0xd8d2c2, 4, 3); break
        case 'hit':
          burst(e.x, e.y, e.z, 0xffffff, 5, 3)
          if (e.owner === me.id) {
            pop(e.x, e.y + 0.4, e.z, String(e.dmg), e.head ? '#ff9f1c' : yellowC, e.head ? 0.7 : 0.5)
            hitmark.current = Date.now()
          }
          if (e.target === me.id) flash.current = Date.now()
          break
        case 'wallbreak': burst(e.x, 1.4, e.z, 0xb07a3f, 22, 6); break
        case 'kill': {
          const v = w.players[e.victim]
          burst(v.x, v.y + 1, v.z, 0xffd23f, 18, 5)
          const killer = e.killer >= 0 ? w.players[e.killer].name : 'The storm'
          feedLog.push({ id: ++feedId, at: Date.now(), text: `${killer} eliminated ${v.name}${e.weapon !== 'storm' ? ` (${WEAPONS[e.weapon].name})` : ''}` })
          break
        }
        case 'pickup': {
          const l = lootMeshes.get(e.id)
          if (l) { scene.remove(l.group); lootMeshes.delete(e.id) }
          break
        }
        default: break
      }
    }

    // ---------- input ----------
    const I = inp.current
    I.keys.clear(); I.fire = false; I.jump = false; I.build = false; I.slot = undefined
    const kd = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault()
      if (e.repeat) return
      I.keys.add(e.code)
      if (e.code === 'Space') I.jump = true
      if (e.code === 'KeyF') I.build = true
      if (e.code >= 'Digit1' && e.code <= 'Digit4') I.slot = Number(e.code.slice(5)) - 1
    }
    const ku = (e: KeyboardEvent) => I.keys.delete(e.code)
    const mm = (e: MouseEvent) => {
      if (document.pointerLockElement !== dom) return
      view.current.yaw += e.movementX * 0.0022
      view.current.pitch = Math.max(-1.15, Math.min(1.2, view.current.pitch - e.movementY * 0.0022))
    }
    const md = (e: MouseEvent) => { if (document.pointerLockElement === dom && e.button === 0) I.fire = true }
    const mu = (e: MouseEvent) => { if (e.button === 0) I.fire = false }
    const wheel = (e: WheelEvent) => {
      if (document.pointerLockElement !== dom) return
      const n = me.weapons.length
      I.slot = (me.slot + (e.deltaY > 0 ? 1 : -1) + n) % n
    }
    const plc = () => { const on = document.pointerLockElement === dom; I.locked = on; uiState.locked = on; if (!on) I.fire = false }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    document.addEventListener('mousemove', mm)
    dom.addEventListener('mousedown', md)
    window.addEventListener('mouseup', mu)
    dom.addEventListener('wheel', wheel, { passive: true })
    document.addEventListener('pointerlockchange', plc)
    dom.addEventListener('contextmenu', e => e.preventDefault())
    ;(window as unknown as { __storm?: unknown }).__storm = { world: w, view: view.current, input: I }

    // ---------- camera ----------
    const camPos = new THREE.Vector3()
    const lookDir = new THREE.Vector3()
    const placeCamera = (p: typeof me, yaw: number, pitch: number) => {
      const cp = Math.cos(pitch)
      lookDir.set(Math.cos(yaw) * cp, Math.sin(pitch), Math.sin(yaw) * cp)
      const [ex, ey, ez] = eyeOf(p)
      const rx = -Math.sin(yaw), rz = Math.cos(yaw)
      const want = new THREE.Vector3(ex - lookDir.x * CAM_DIST + rx * 0.85, ey - lookDir.y * CAM_DIST + 0.3, ez - lookDir.z * CAM_DIST + rz * 0.85)
      // pull the camera in if a wall is in the way
      const to = want.clone().sub(new THREE.Vector3(ex, ey, ez))
      const dist = to.length()
      to.normalize()
      const hit = rayCast(w, ex, ey, ez, to.x, to.y, to.z, dist, p.id)
      const d = hit && hit.kind === 'box' ? Math.max(0.5, hit.t - 0.25) : dist
      camPos.set(ex + to.x * d, Math.max(0.3, ey + to.y * d), ez + to.z * d)
      camera.position.copy(camPos)
      camera.lookAt(camPos.x + lookDir.x, camPos.y + lookDir.y, camPos.z + lookDir.z)
    }

    // ---------- minimap ----------
    const drawMini = () => {
      const mini = wrap.querySelector<HTMLCanvasElement>('canvas.st-mini')
      if (!mini) return
      const g = mini.getContext('2d')!
      const S = mini.width, k = S / ((MAP_R + 14) * 2)
      const X = (x: number) => S / 2 + x * k, Z = (z: number) => S / 2 + z * k
      g.clearRect(0, 0, S, S)
      g.save()
      g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2); g.clip()
      g.fillStyle = 'rgba(40,90,50,0.85)'; g.fillRect(0, 0, S, S)
      g.fillStyle = 'rgba(230,220,190,0.9)'
      for (const b of w.map.buildings) g.fillRect(X(b.cx - b.w / 2), Z(b.cz - b.d / 2), b.w * k, b.d * k)
      const R = stormRadius(w.t)
      g.beginPath(); g.rect(0, 0, S, S); g.arc(S / 2, S / 2, R * k, 0, Math.PI * 2, true)
      g.fillStyle = 'rgba(120,50,220,0.45)'; g.fill('evenodd')
      g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.arc(S / 2, S / 2, R * k, 0, Math.PI * 2); g.stroke()
      const f = me.alive ? me : w.players.find(p => p.alive) ?? me
      g.translate(X(f.x), Z(f.z)); g.rotate(f.yaw + Math.PI / 2)
      g.fillStyle = yellowC
      g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath(); g.fill()
      g.restore()
    }

    // ---------- loop ----------
    let raf = 0
    let prev = performance.now()
    let hudAt = 0
    const uiTick = 100

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min((now - prev) / 1000, 0.05)
      prev = now
      const v = view.current

      // input -> engine
      const f = { x: Math.cos(v.yaw), z: Math.sin(v.yaw) }, r = { x: -Math.sin(v.yaw), z: Math.cos(v.yaw) }
      const fwd = (I.keys.has('KeyW') ? 1 : 0) - (I.keys.has('KeyS') ? 1 : 0)
      const rgt = (I.keys.has('KeyD') ? 1 : 0) - (I.keys.has('KeyA') ? 1 : 0)
      let mx = f.x * fwd + r.x * rgt, mz = f.z * fwd + r.z * rgt
      const ml = Math.hypot(mx, mz)
      if (ml > 0) { mx /= ml; mz /= ml }

      let aim: [number, number, number] | undefined
      if (me.alive) {
        placeCamera(me, v.yaw, v.pitch)
        const hit = rayCast(w, camPos.x, camPos.y, camPos.z, lookDir.x, lookDir.y, lookDir.z, 260, me.id)
        const T = hit ? new THREE.Vector3(hit.x, hit.y, hit.z) : camPos.clone().addScaledVector(lookDir, 120)
        const [ex, ey, ez] = eyeOf(me)
        const d = T.sub(new THREE.Vector3(ex, ey, ez)).normalize()
        aim = [d.x, d.y, d.z]
      }

      const sent = api.send({
        mx, mz, yaw: v.yaw, pitch: v.pitch, ...(aim ? { aim } : {}),
        fire: I.fire && I.locked, jump: I.jump, sprint: I.keys.has('ShiftLeft') || I.keys.has('ShiftRight'),
        build: I.build, ...(I.slot !== undefined ? { slot: I.slot } : {}),
      })
      if (sent) { I.jump = false; I.build = false; I.slot = undefined }   // one-shot actions stay pending until they really went out
      easeToTargets(w.players, dt)

      for (const e of w.events) onEvent(e)
      w.events.length = 0

      // world objects
      const live = new Set<number>()
      for (const b of w.map.boxes) {
        if (b.kind === 'build') {
          live.add(b.id)
          let g = meshes.get(b.id)
          if (!g) { addBox(b, true); g = meshes.get(b.id) }
          if (g && g.scale.y < 1) g.scale.y = Math.min(1, g.scale.y + dt * 8)
        }
      }
      meshes.forEach((g, id) => {
        const box = w.map.boxes.find(b => b.id === id)
        if (!box) { scene.remove(g); meshes.delete(id) }
      })

      // storm
      const R = stormRadius(w.t)
      stormWall.scale.set(R, 1, R)
      stormFloor.scale.set(R, R, 1)

      // loot
      const tt = now / 1000
      for (const l of w.loot) {
        let m = lootMeshes.get(l.id)
        if (!m) { m = makeLoot(l.kind); m.group.position.set(l.x, 0, l.z); scene.add(m.group); lootMeshes.set(l.id, m) }
        m.item.rotation.y = tt * 1.6 + l.id
        m.item.position.y = 0.9 + Math.sin(tt * 2.4 + l.id) * 0.12
      }

      // soldiers
      w.players.forEach((p, i) => {
        const s = soldiers[i]
        s.group.visible = p.alive
        if (!p.alive) return
        const moved = Math.hypot(p.x - prevPos[i].x, p.z - prevPos[i].z) / Math.max(dt, 1e-4)
        prevPos[i].set(p.x, p.y, p.z)
        phase0[i] += Math.min(moved, 8) * dt * 1.6
        const swing = Math.min(1, moved / 5) * 0.7
        s.legL.rotation.x = Math.sin(phase0[i] * 2) * swing
        s.legR.rotation.x = -Math.sin(phase0[i] * 2) * swing
        s.group.position.set(p.x, p.y, p.z)
        s.group.rotation.y = Math.PI / 2 - p.yaw
        s.gunPivot.rotation.x = -p.pitch
        s.armPivot.rotation.x = -Math.PI / 2 - p.pitch
        s.setWeapon(p.weapons[p.slot])
        const kick = Math.max(0, 1 - (w.t - p.lastShot) / 0.09)
        s.gunPivot.position.z = 0.12 - kick * 0.07
        s.hip.position.y = Math.abs(Math.sin(phase0[i] * 2)) * 0.05 * Math.min(1, moved / 5)
      })

      // effects
      for (let i = fx.length - 1; i >= 0; i--) {
        const e = fx[i]
        e.life -= dt
        const k = Math.max(0, e.life / e.max)
        if (e.kind === 'bit') {
          e.vy -= e.grav * dt
          e.obj.position.x += e.vx * dt; e.obj.position.y = Math.max(0.05, e.obj.position.y + e.vy * dt); e.obj.position.z += e.vz * dt
        } else if (e.kind === 'text') {
          e.obj.position.y += e.vy * dt
          ;((e.obj as THREE.Sprite).material as THREE.SpriteMaterial).opacity = Math.min(1, k * 2.5)
        } else if (e.kind === 'flash') {
          ;((e.obj as THREE.Sprite).material as THREE.SpriteMaterial).opacity = k
        }
        if (e.life <= 0) {
          scene.remove(e.obj)
          if (e.kind === 'text' || e.kind === 'flash') ((e.obj as THREE.Sprite).material as THREE.Material).dispose()
          fx.splice(i, 1)
        }
      }

      // camera when eliminated: follow whoever is still up
      if (!me.alive) {
        const t = w.players.filter(p => p.alive).sort((a, b) => (b.hp + b.shield) - (a.hp + a.shield))[0]
        if (t) placeCamera(t, t.yaw, 0.25)
      }

      sun.position.set(camera.position.x + 40, 90, camera.position.z + 30)
      sun.target.position.set(camera.position.x, 0, camera.position.z)
      sun.target.updateMatrixWorld()

      renderer.render(scene, camera)
      drawMini()

      if (now - hudAt > uiTick) {
        hudAt = now
        const dc = Math.hypot(me.x, me.z)
        const cut = Date.now() - 6000
        while (feedLog.length && feedLog[0].at < cut) feedLog.shift()
        api.ui({
          t: w.t, alive: w.players.filter(p => p.alive).length, kills: me.kills, hp: me.hp, shield: me.shield, mats: Math.floor(me.mats),
          weapons: [...me.weapons], slot: me.slot, me: me.alive,
          stormIn: Math.max(0, 8 - w.t), inStorm: w.t > 8 && dc > R,
          hitFlash: Date.now() - hitmark.current < 160, flash: Date.now() - flash.current < 220,
          locked: uiState.locked, feed: [...feedLog].slice(-5),
        } satisfies StormUi)
      }
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      document.removeEventListener('mousemove', mm)
      dom.removeEventListener('mousedown', md)
      window.removeEventListener('mouseup', mu)
      dom.removeEventListener('wheel', wheel)
      document.removeEventListener('pointerlockchange', plc)
      if (document.pointerLockElement === dom) document.exitPointerLock()
      soldiers.forEach(s => s.dispose())
      scene.traverse(o => {
        const m = o as THREE.Mesh
        m.geometry?.dispose?.()
      })
      labelTex.forEach(t => t.dispose())
      renderer.dispose()
      dom.remove()
    }
  },
}

const StormRoyale = () => <NetShell adapter={adapter} />

export default StormRoyale
