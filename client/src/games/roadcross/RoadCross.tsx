import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { RotateCcw } from 'lucide-react'
import { useSolo } from '../net/useSolo'
import { hopX, ROAD_W, STRIP_W, STEP_W, HOP_SEC, type Lane, type Car } from './traffic'
import { DIFFS, MAX_STEPS, HERO_Y, LANE_LEN, multAt, round2, type DiffKey } from './engine'
import type { RoadSnap } from './net'
import { makeCar, makePenguin, makeSheep, emojiSprite, textTexture, disposeTextures, type CarModel } from './models'

const START_X = 90
const stripX = (k: number) => START_X + k * STEP_W

const HEROES = [
  { emoji: '🐸', name: 'Frog' },
  { emoji: '🐰', name: 'Bunny' },
  { emoji: '🐧', name: 'Penguin' },
  { emoji: '🐱', name: 'Cat' },
  { emoji: '🦆', name: 'Duck' },
  { emoji: '🐷', name: 'Pig' },
  { emoji: '🐑', name: 'Black Sheep', dark: true },
]

// heroes drawn as real 3D models; everything else is an upright emoji
const HERO_MODELS: Record<string, () => ReturnType<typeof makePenguin>> = { '🐧': makePenguin, '🐑': makeSheep }

type Status = 'idle' | 'ready' | 'hopping' | 'dead' | 'cashed'
// what is left of the hero after a hit: a tumbling body that cars can keep knocking around
type Body = {
  x: number; y: number; z: number
  vx: number; vy: number; vz: number
  rx: number; ry: number; rz: number
  sx: number; sy: number; sz: number
  rest: boolean; gone: boolean
}

type Game = {
  status: Status
  step: number
  p: number
  rate: number
  hero: string
  lanes: Lane[]
  hopT: number
  queued: boolean
  camX: number
  t: number
  endAt: number
  deadU: number
  body: Body | null
}

const cssVar = (el: Element, name: string) => getComputedStyle(el).getPropertyValue(name).trim()

const RoadCross = () => {
  const [bet, setBet] = useState('1')
  const [diff, setDiff] = useState<DiffKey>('medium')
  const [hero, setHero] = useState(HEROES[0].emoji)
  const [snapStatus, setSnapStatus] = useState<Status>('idle')
  const [step, setStep] = useState(0)

  const cfg = DIFFS.find(d => d.key === diff)!
  const amount = parseFloat(bet)

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const emptyLanes = () => Array.from({ length: MAX_STEPS }, (): Lane => ({ cars: [], timer: 0, rate: 0 }))
  // Mirror of the server's state: the server decides everything (traffic, hits, payout); this is only what we draw.
  const game = useRef<Game>({
    status: 'idle', step: 0, p: cfg.p, rate: cfg.rate, hero, lanes: emptyLanes(), hopT: 0, queued: false,
    camX: 0, t: 0, endAt: 0, deadU: 0, body: null,
  })
  const hitRef = useRef<RoadSnap['hit']>(null)
  const carIds = useRef(new Map<number, Car>())   // keeps one Car object per server car id so 3D models persist

  const onSnap = useCallback((s: RoadSnap) => {
    const g = game.current
    g.status = s.status
    g.step = s.step
    g.hopT = s.hopT

    const byId = carIds.current
    const seen = new Set<number>()
    for (const l of g.lanes) l.cars = []
    for (const [k, id, y, ve, len, hue] of s.cars) {
      let c = byId.get(id)
      if (!c) { c = { id, y, v: ve, ve, len, hue }; byId.set(id, c) }
      else { c.y = y; c.ve = ve; c.v = ve }
      g.lanes[k].cars.push(c)
      seen.add(id)
    }
    for (const id of [...byId.keys()]) if (!seen.has(id)) byId.delete(id)

    hitRef.current = s.hit   // the server says where the hero was hit; the tumble itself is just visuals (see the render loop)
    if (s.status === 'dead' && g.endAt === 0 && s.hit) { g.deadU = s.hit.u; g.endAt = g.t }
    if (s.status === 'cashed' && g.endAt === 0) g.endAt = g.t
    setSnapStatus(s.status)
    setStep(s.step)
  }, [])

  const solo = useSolo<RoadSnap>('roadcross', onSnap)
  const { balance, phase, error, result, bet: stake } = solo

  const status: Status = phase === 'playing' ? snapStatus : phase === 'done' ? (result?.result === 'cash' ? 'cashed' : 'dead') : 'idle'
  const busy = phase === 'playing'
  const mult = multAt(step, cfg.p)
  const nextMult = multAt(step + 1, cfg.p)
  const payout = round2((busy ? stake : amount > 0 ? amount : 0) * mult)

  const last = phase === 'done' && result
    ? { win: result.result === 'cash', amount: result.result === 'cash' ? result.payout : result.bet }
    : null

  const play = () => {
    if (!(amount > 0)) return solo.setError('Enter a bet amount')
    if (balance !== null && amount > balance) return solo.setError('Insufficient balance')
    carIds.current.clear()
    hitRef.current = null
    Object.assign(game.current, {
      status: 'ready', step: 0, p: cfg.p, rate: cfg.rate, hero, lanes: emptyLanes(),
      hopT: 0, queued: false, camX: 0, endAt: 0, deadU: 0, body: null,
    })
    setStep(0)
    solo.start(amount, { diff })
  }

  // the jump happens right now on the server: no waiting for a gap, cars decide your fate
  const go = useCallback(() => solo.act('go'), [solo])
  const cashOut = useCallback(() => solo.act('cash'), [solo])

  // keyboard: enter = cash out (jumping is mouse-only)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.code === 'Enter') { e.preventDefault(); cashOut() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cashOut])

  useEffect(() => {
    const canvas = canvasRef.current!
    const wrap = wrapRef.current!
    let raf = 0
    let prev = 0

    // ---------- scene ----------
    const bgHex = cssVar(canvas, '--bg')
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(bgHex)
    scene.fog = new THREE.Fog(bgHex, 520, 980)
    const camera = new THREE.PerspectiveCamera(32, 1, 1, 2000)

    const resize = () => {
      const W = wrap.clientWidth, H = wrap.clientHeight
      renderer.setSize(W, H, false)
      camera.aspect = W / H
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x2b3646, 1.05))
    const sun = new THREE.DirectionalLight(0xfff2dd, 1.7)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -340, right: 340, top: 340, bottom: -340, near: 10, far: 1200 })
    sun.shadow.bias = -0.0004
    scene.add(sun, sun.target)

    const grassCol = new THREE.Color(cssVar(canvas, '--win') || '#4ade80').multiplyScalar(0.5)
    const grass = new THREE.MeshStandardMaterial({ color: grassCol, roughness: 0.95 })
    const asphalt = new THREE.MeshStandardMaterial({ color: 0x2b303b, roughness: 0.92 })
    const padMat = new THREE.MeshStandardMaterial({ color: grassCol.clone().multiplyScalar(1.6), roughness: 0.9 })

    const dashCanvas = document.createElement('canvas')
    dashCanvas.width = 8; dashCanvas.height = 64
    const dg = dashCanvas.getContext('2d')!
    dg.fillStyle = '#e8edf5'
    dg.fillRect(0, 0, 8, 32)
    const dashTex = new THREE.CanvasTexture(dashCanvas)
    dashTex.wrapT = THREE.RepeatWrapping
    const Z_MIN = -HERO_Y - 140, Z_MAX = LANE_LEN - HERO_Y + 140
    const SPAN = Z_MAX - Z_MIN, ZC = (Z_MIN + Z_MAX) / 2
    dashTex.repeat.set(1, SPAN / 40)
    const dashMat = new THREE.MeshBasicMaterial({ map: dashTex, transparent: true, opacity: 0.55 })

    const roadX = (k: number) => stripX(k) + STRIP_W / 2 + ROAD_W / 2

    const checker = document.createElement('canvas')
    checker.width = 64; checker.height = 64
    const cg = checker.getContext('2d')!
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { cg.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4'; cg.fillRect(i * 8, j * 8, 8, 8) }
    const checkerTex = new THREE.CanvasTexture(checker)
    checkerTex.wrapS = checkerTex.wrapT = THREE.RepeatWrapping
    checkerTex.repeat.set(2, 30)
    const checkerMat = new THREE.MeshStandardMaterial({ map: checkerTex })

    // shared bits for scenery
    const trunkGeo = new THREE.CylinderGeometry(2, 2.6, 14, 8)
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 })
    const leafGeo = new THREE.IcosahedronGeometry(11, 1)
    const leafMat = new THREE.MeshStandardMaterial({ color: grassCol.clone().multiplyScalar(1.5), roughness: 0.85, flatShading: true })
    const lampGeo = new THREE.CylinderGeometry(1.1, 1.4, 44, 8)
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x8a94a3, roughness: 0.5, metalness: 0.6 })
    const lampHeadGeo = new THREE.BoxGeometry(9, 2.4, 4.5)
    const lampGlow = new THREE.MeshStandardMaterial({ color: 0xfff1c2, emissive: 0xffe6a0, emissiveIntensity: 1.5 })

    const labelSprites: THREE.Sprite[] = []
    const labelState: string[] = []
    const dimHex = cssVar(canvas, '--text-mid') || '#8899b8'
    const yellowHex = cssVar(canvas, '--yellow') || '#facc15'

    for (let k = 0; k <= MAX_STEPS; k++) {
      const x = stripX(k)
      const strip = new THREE.Mesh(new THREE.BoxGeometry(STRIP_W, 3, SPAN), k === MAX_STEPS ? checkerMat : grass)
      strip.position.set(x, -1.5 + 1.5, ZC)
      strip.receiveShadow = true
      scene.add(strip)

      const pad = new THREE.Mesh(new THREE.CircleGeometry(19, 28), padMat)
      pad.rotation.x = -Math.PI / 2
      pad.position.set(x, 3.05, 0)
      pad.receiveShadow = true
      scene.add(pad)

      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture(' ', dimHex), transparent: true, depthTest: false }))
      label.scale.set(64, 16, 1)
      label.position.set(x, 70, -60)
      label.renderOrder = 5
      scene.add(label)
      labelSprites.push(label)
      labelState.push('')

      if (k < MAX_STEPS) {
        const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, SPAN), asphalt)
        road.rotation.x = -Math.PI / 2
        road.position.set(roadX(k), 0.1, ZC)
        road.receiveShadow = true
        scene.add(road)
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(2.4, SPAN), dashMat)
        dash.rotation.x = -Math.PI / 2
        dash.position.set(roadX(k), 0.25, ZC)
        scene.add(dash)
      }

      // trees and lamps along the strips
      if (k > 0 && k < MAX_STEPS) {
        for (const z of [-330, -190, 170, 300]) {
          if ((k * 7 + z) % 3 === 0) continue
          const tree = new THREE.Group()
          const trunk = new THREE.Mesh(trunkGeo, trunkMat); trunk.position.y = 7 + 3; trunk.castShadow = true
          const leaves = new THREE.Mesh(leafGeo, leafMat); leaves.position.y = 27; leaves.scale.set(1, 1.15, 1); leaves.castShadow = true
          tree.add(trunk, leaves)
          tree.position.set(x + ((k * 13 + z) % 3 - 1) * 8, 0, z)
          scene.add(tree)
        }
        const lamp = new THREE.Group()
        const pole = new THREE.Mesh(lampGeo, lampMat); pole.position.y = 25; pole.castShadow = true
        const head = new THREE.Mesh(lampHeadGeo, lampGlow); head.position.set(4, 47, 0)
        lamp.add(pole, head)
        lamp.position.set(x + STRIP_W / 2 - 6, 0, k % 2 ? -70 : 90)
        scene.add(lamp)
      }
    }

    // ---------- hero ----------
    let heroKey = ''
    let heroObj: THREE.Object3D | null = null
    let penguin: ReturnType<typeof makePenguin> | null = null   // the 3D hero model, whichever one is picked
    let pivot: THREE.Group | null = null
    let blob: THREE.Mesh | null = null
    const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 })
    const blobGeo = new THREE.CircleGeometry(13, 20)
    const setHero = (emoji: string) => {
      if (heroKey === emoji) return
      heroKey = emoji
      if (heroObj) scene.remove(heroObj)
      if (blob) scene.remove(blob)
      penguin = null; blob = null; pivot = null
      if (HERO_MODELS[emoji]) {
        penguin = HERO_MODELS[emoji]()
        penguin.group.scale.setScalar(1.1)
        pivot = new THREE.Group()          // tumbles around the penguin's middle
        penguin.group.position.y = -14
        pivot.add(penguin.group)
        heroObj = pivot
      } else {
        heroObj = emojiSprite(emoji)
        blob = new THREE.Mesh(blobGeo, blobMat)
        blob.rotation.x = -Math.PI / 2
        scene.add(blob)
      }
      scene.add(heroObj)
    }

    // ---------- cars ----------
    const models = new Map<Car, CarModel & { k: number }>()

    // ---------- loop ----------
    const stepBody = (g: Game, h: number) => {
      const b = g.body!
      const lane = g.lanes[g.step]

      // a car reaching the body on the road shoves it along instead of driving through it
      if (b.y < 26) {
        for (const c of lane.cars) {
          if (Math.abs(c.y - (b.z + HERO_Y)) < c.len / 2 + 12 && c.ve * 1.02 > b.vz - 5) {
            b.vz = c.ve * 1.05 + 20
            b.vy = Math.max(b.vy, 40 + c.ve * 0.28)
            b.vx += (Math.random() - 0.5) * 60
            b.sx += c.ve / 60
            b.sz += (Math.random() - 0.5) * c.ve / 40
          }
        }
      }

      b.vy -= 900 * h
      b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h
      b.rx += b.sx * h; b.ry += b.sy * h; b.rz += b.sz * h
      if (b.y <= 0) {
        b.y = 0
        if (b.vy < -70) { b.vy = -b.vy * 0.32; b.vz *= 0.72; b.vx *= 0.7; b.sx *= 0.8; b.sz *= 0.8 }
        else b.vy = 0
      }
      if (b.y === 0 && b.vy === 0) {
        const f = Math.exp(-2.2 * h), s = Math.exp(-3 * h)
        b.vz *= f; b.vx *= f; b.sx *= s; b.sy *= s; b.sz *= s
      }
      const cx = roadX(g.step), lim = ROAD_W / 2 - 10
      if (Math.abs(b.x - cx) > lim) { b.x = cx + Math.sign(b.x - cx) * lim; b.vx *= -0.3 }
      b.rest = b.y === 0 && Math.hypot(b.vz, b.vx) < 25
      if (b.z > 480) b.gone = true      // knocked out of sight
    }

    // between snapshots keep things moving; the server's snapshots keep correcting this
    const tick = (g: Game, h: number) => {
      for (const l of g.lanes) for (const c of l.cars) c.y += c.ve * h
      if (g.body && !g.body.gone) stepBody(g, h)
      if (g.status === 'hopping') g.hopT = Math.min(HOP_SEC, g.hopT + h)
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (!prev) prev = now
      const dt = Math.min((now - prev) / 1000, 0.05)
      prev = now
      const g = game.current
      g.t += dt

      if (g.status === 'dead' && !g.body && hitRef.current) {
        const { u: hu, ve } = hitRef.current
        g.body = {
          x: stripX(g.step) + hopX(hu), y: Math.sin(hu * Math.PI) * 34, z: 0,
          vx: (Math.random() - 0.5) * 50, vy: 70 + ve * 0.4, vz: ve * 1.15 + 30,
          rx: 0, ry: 0, rz: 0,
          sx: (ve / 30) * (0.7 + Math.random() * 0.6), sy: (Math.random() - 0.5) * ve / 25, sz: (Math.random() - 0.5) * ve / 18,
          rest: false, gone: false,
        }
      }
      const n = Math.ceil(dt / 0.008)
      for (let i = 0; i < n; i++) tick(g, dt / n)

      setHero(g.hero)
      const u = g.status === 'hopping' ? Math.min(1, g.hopT / HOP_SEC) : g.status === 'dead' ? g.deadU : 0
      const heroX = stripX(g.step) + hopX(u)
      g.camX += ((g.body ? g.body.x : heroX) + 175 - g.camX) * Math.min(1, dt * 6)

      // strip labels: multiplier to reach, gold once passed
      for (let k = 0; k <= MAX_STEPS; k++) {
        const text = k === 0 ? 'START' : k === MAX_STEPS ? `FINISH ${multAt(k, g.p).toFixed(2)}×` : `${multAt(k, g.p).toFixed(2)}×`
        const passed = k <= g.step && g.status !== 'idle'
        const key = text + passed
        if (labelState[k] !== key) {
          labelState[k] = key
          const sp = labelSprites[k]
          ;(sp.material as THREE.SpriteMaterial).map = textTexture(text, passed ? yellowHex : dimHex)
          ;(sp.material as THREE.SpriteMaterial).needsUpdate = true
        }
      }

      // hero pose
      const arc = g.status === 'hopping' ? Math.sin(u * Math.PI) * 34 : 0
      const bounce = g.status === 'cashed' ? Math.abs(Math.sin((g.t - g.endAt) * 7)) * 14 : 0
      const y = arc + bounce
      const body = g.body
      if (body && heroObj) {
        heroObj.visible = !body.gone
        if (blob) blob.visible = !body.gone
        if (body.rest) {                          // settle onto its side
          const k = Math.min(1, dt * 7)
          body.rz += (Math.round((body.rz - Math.PI / 2) / (2 * Math.PI)) * 2 * Math.PI + Math.PI / 2 - body.rz) * k
          body.rx += (Math.round(body.rx / (2 * Math.PI)) * 2 * Math.PI - body.rx) * k
        }
        if (blob) blob.position.set(body.x, 3.2, body.z)
        if (penguin && pivot) {
          pivot.position.set(body.x, body.y + 14, body.z)
          pivot.rotation.set(body.rx, body.ry, body.rz)
          penguin.flap(1.1)
          penguin.body.rotation.set(0, 0, 0)
        } else {
          const sp = heroObj as THREE.Sprite
          sp.center.set(0.5, 0.5)
          sp.position.set(body.x, body.y + 18, body.z)
          sp.material.rotation = body.rx + body.rz
        }
      } else {
        if (heroObj) heroObj.visible = true
        if (blob) blob.visible = true
        if (penguin && pivot) {
          pivot.rotation.set(0, 0, 0)
          pivot.position.set(heroX, y + 14, 0)
          const hopping = g.status === 'hopping'
          const flap = hopping ? Math.sin(g.t * 34) * 0.8 : g.status === 'cashed' ? 1.2 : Math.sin(g.t * 3) * 0.06
          penguin.flap(flap)
          penguin.body.rotation.x = hopping ? Math.sin(u * Math.PI) * 0.35 : 0
          penguin.body.rotation.z = hopping ? Math.sin(g.t * 24) * 0.08 : Math.sin(g.t * 2.4) * 0.03
          penguin.group.rotation.y = Math.PI / 2
        } else if (heroObj) {
          const sp = heroObj as THREE.Sprite
          sp.center.set(0.5, 0.1)
          sp.material.rotation = 0
          sp.position.set(heroX, y, 0)
          if (blob) { blob.position.set(heroX, 3.2, 0); blob.scale.setScalar(Math.max(0.4, 1 - arc / 80)) }
        }
      }

      // cars near the camera
      const seen = new Set<Car>()
      const from = Math.max(0, g.step - 1), to = Math.min(MAX_STEPS - 1, g.step + 6)
      for (let k = from; k <= to; k++) {
        for (const c of g.lanes[k]?.cars ?? []) {
          seen.add(c)
          let m = models.get(c)
          if (!m) {
            const built = makeCar(c.len, c.hue)
            m = { ...built, k }
            scene.add(m.group)
            models.set(c, m)
          }
          m.group.position.set(roadX(k), 0, c.y - HERO_Y)
          m.wheels.forEach(w => { w.rotation.x += (c.ve / 6.6) * dt })
          m.tick?.(g.t)
        }
      }
      models.forEach((m, c) => {
        if (!seen.has(c)) { scene.remove(m.group); m.dispose(); models.delete(c) }
      })

      // camera + light follow
      camera.position.set(g.camX, 520, 400)
      camera.lookAt(g.camX, 0, 20)
      sun.position.set(g.camX - 120, 420, 160)
      sun.target.position.set(g.camX - 80, 0, 0)
      sun.target.updateMatrixWorld()

      renderer.render(scene, camera)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      models.forEach(m => m.dispose())
      scene.traverse(o => {
        const mm = o as THREE.Mesh
        mm.geometry?.dispose?.()
      })
      disposeTextures()
      dashTex.dispose(); checkerTex.dispose()
      renderer.dispose()
    }
  }, [])

  return (
    <div className="dc">
      <div className="dc-top">
        <div className="dc-balance">
          <span>Balance</span>
          <b>{balance === null ? '—' : balance.toFixed(2)}</b>
        </div>
        <button className="dc-reset" onClick={solo.reset} title="Reset balance">
          <RotateCcw size={14} /> Reset
        </button>
      </div>

      <div className="dc-main">
        <div className="dc-controls">
          <label className="dc-label">Bet amount</label>
          <div className="dc-bet">
            <input type="number" aria-label="Bet amount" min="0" step="0.01" value={bet} disabled={busy} onChange={e => setBet(e.target.value)} />
            <button disabled={busy} onClick={() => setBet(b => String(round2(Math.max(0.01, (parseFloat(b) || 0.02) / 2))))}>½</button>
            <button disabled={busy} onClick={() => setBet(b => String(round2((parseFloat(b) || 0) * 2)))}>2×</button>
          </div>

          <label className="dc-label">Difficulty</label>
          <div className="rc-chips">
            {DIFFS.map(d => (
              <button key={d.key} disabled={busy} className={`rc-chip${diff === d.key ? ' rc-chip--on' : ''}`} onClick={() => setDiff(d.key)}>
                {d.label}
              </button>
            ))}
          </div>
          <small className="rc-hint">More traffic on harder levels, and now and then a car comes through much faster.</small>

          <label className="dc-label">Character</label>
          <div className="rc-chips">
            {HEROES.map(h => (
              <button key={h.emoji} disabled={busy} title={h.name} className={`rc-chip rc-chip--emoji${'dark' in h ? ' rc-chip--dark' : ''}${hero === h.emoji ? ' rc-chip--on' : ''}`} onClick={() => setHero(h.emoji)}>
                {h.emoji}
              </button>
            ))}
          </div>

          {busy ? (
            <>
              <button className="dc-roll" onClick={go}>Jump · {nextMult.toFixed(2)}×</button>
              <button className="rc-cash" onClick={cashOut} disabled={status !== 'ready' || step < 1}>
                Cash out {step >= 1 ? payout.toFixed(2) : ''}
              </button>
            </>
          ) : (
            <button className="dc-roll" onClick={play} disabled={phase === 'connecting' || (phase === 'offline' && solo.offline !== 'login')}>{status === 'idle' ? 'Play' : 'Play again'}</button>
          )}

          {last && (
            <p className={last.win ? 'rc-note rc-note--win' : 'dc-error'}>
              {last.win ? `Cashed out +${last.amount.toFixed(2)}` : `Splat! Lost ${last.amount.toFixed(2)}`}
            </p>
          )}
          {error && <p className="dc-error">{error}</p>}
          {phase === 'offline' && solo.offline === 'server' && <p className="dc-error">Cannot reach the game server. Make sure it is running (npm run server).</p>}
          {phase === 'offline' && solo.offline === 'lost' && (
            <p className="dc-error">Connection lost. <button className="gp-link" onClick={solo.reconnect}>Reconnect</button></p>
          )}
          <small className="rc-hint">Click Jump to hop · Enter to cash out · results are decided on the server</small>
        </div>

        <div className="dc-board rc-board" ref={wrapRef}>
          <canvas ref={canvasRef} className="rc-canvas" />
          {status !== 'idle' && (
            <div className="rc-hud">
              <b className={status === 'dead' ? 'rc-hud-mult rc-hud-mult--lose' : 'rc-hud-mult'}>{mult.toFixed(2)}×</b>
              <span>Road {step}/{MAX_STEPS} · about {(cfg.p * 100).toFixed(0)}% to make it across</span>
            </div>
          )}
          {status === 'dead' && <div className="rc-banner rc-banner--lose">SPLAT!</div>}
          {status === 'cashed' && last && <div className="rc-banner">+{last.amount.toFixed(2)}</div>}
        </div>
      </div>
    </div>
  )
}

export default RoadCross
