import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { RotateCcw, Trophy, Skull, FastForward } from 'lucide-react'
import { useDemoBalance, round2 } from '../../hooks/useDemoBalance'
import { createWorld, step, arenaRadius, ROUND_SEC, PLAYERS, MAX_HP, type World, type GameEvent } from './engine'

type Phase = 'lobby' | 'playing' | 'done'
type Hud = {
  t: number; alive: number; hp: number; gold: number; kills: number; me: boolean
  board: { name: string; hp: number; me: boolean; alive: boolean }[]
}

const cssVar = (el: Element, name: string) => getComputedStyle(el).getPropertyValue(name).trim()

const HIT_TEXTS = ['BAWK!', 'OUCH!', 'CLUCK!', 'EGG-STRA!', 'SHELL YEAH']

const Chicken = () => {
  const { balance, setBalance, reset } = useDemoBalance()

  const [bet, setBet] = useState('1')
  const [phase, setPhase] = useState<Phase>('lobby')
  const [error, setError] = useState('')
  const [hud, setHud] = useState<Hud | null>(null)
  const [result, setResult] = useState<{ place: number; payout: number; kills: number; stake: number } | null>(null)

  const amount = parseFloat(bet)
  const pool = round2((amount > 0 ? amount : 0) * PLAYERS)

  const wrapRef = useRef<HTMLDivElement>(null)
  const world = useRef<World | null>(null)
  const stake = useRef(0)

  const finish = useCallback((w: World) => {
    const me = w.chickens.find(c => c.human)!
    const payout = me.id === w.winner ? round2(stake.current * PLAYERS) : 0
    if (payout > 0) setBalance(b => b + payout)
    setResult({ place: me.place, payout, kills: me.kills, stake: stake.current })
    setPhase('done')
  }, [setBalance])

  const start = () => {
    if (!(amount > 0)) return setError('Enter a bet amount')
    if (amount > balance) return setError('Insufficient balance')
    setError('')
    stake.current = amount
    setBalance(b => b - amount)
    world.current = createWorld()
    setResult(null)
    setHud(null)
    setPhase('playing')
  }

  const skip = () => {
    const w = world.current
    if (!w) return
    while (!w.over) { step(w, 0.05); w.events.length = 0 }
  }

  useEffect(() => {
    if (phase !== 'playing') return
    const wrap = wrapRef.current!
    const w = world.current!

    // ---------- scene ----------
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.shadowMap.enabled = true
    renderer.domElement.className = 'sl-canvas'
    wrap.prepend(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(cssVar(wrap, '--bg'))
    scene.fog = new THREE.Fog(cssVar(wrap, '--bg'), 30, 60)
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100)

    const resize = () => {
      const W = wrap.clientWidth, H = wrap.clientHeight
      renderer.setSize(W, H)
      camera.aspect = W / H
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    scene.add(new THREE.HemisphereLight(0xffffff, 0x556677, 1.1))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(8, 18, 6)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 50 })
    scene.add(sun)

    const std = (color: THREE.ColorRepresentation, extra: THREE.MeshStandardMaterialParameters = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra })

    const grassCol = cssVar(wrap, '--win') || '#4ade80'
    const water = new THREE.Mesh(new THREE.CircleGeometry(60, 48), std(cssVar(wrap, '--accent-dim'), { roughness: 0.3 }))
    water.rotation.x = -Math.PI / 2
    water.position.y = -1.2
    scene.add(water)

    const island = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.9, 1, 64), std(grassCol))
    island.position.y = -0.5
    island.receiveShadow = true
    scene.add(island)

    const rim = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 64), new THREE.MeshBasicMaterial({ color: cssVar(wrap, '--lose') || '#f87171', side: THREE.DoubleSide }))
    rim.rotation.x = -Math.PI / 2
    rim.position.y = 0.02
    scene.add(rim)

    // ---------- shared geometry / materials ----------
    const white = std(0xfff8ee), orange = std(0xff9f1c), red = std(0xe63946), black = std(0x111111)
    const gold = std(0xffd23f, { emissive: 0xffaa00, emissiveIntensity: 0.6, roughness: 0.3 })
    const eggMat = std(0xfffdf5, { roughness: 0.4 })
    const geo = {
      body: new THREE.SphereGeometry(0.6, 20, 16),
      head: new THREE.SphereGeometry(0.32, 16, 12),
      beak: new THREE.ConeGeometry(0.12, 0.3, 10),
      comb: new THREE.SphereGeometry(0.1, 8, 8),
      eye: new THREE.SphereGeometry(0.05, 8, 8),
      wing: new THREE.SphereGeometry(0.3, 10, 8),
      leg: new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6),
      scarf: new THREE.TorusGeometry(0.34, 0.07, 8, 16),
      egg: new THREE.SphereGeometry(0.28, 14, 12),
      bit: new THREE.BoxGeometry(0.14, 0.14, 0.14),
      ring: new THREE.RingGeometry(0.8, 1, 32),
      arrow: new THREE.ConeGeometry(0.22, 0.4, 3),
    }

    const textures = new Map<string, THREE.CanvasTexture>()
    const textTex = (text: string, color: string) => {
      const key = text + color
      let t = textures.get(key)
      if (!t) {
        const c = document.createElement('canvas')
        c.width = 256; c.height = 64
        const g = c.getContext('2d')!
        g.font = '800 40px Manrope, sans-serif'
        g.textAlign = 'center'; g.textBaseline = 'middle'
        g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.lineJoin = 'round'
        g.strokeText(text, 128, 34)
        g.fillStyle = color
        g.fillText(text, 128, 34)
        t = new THREE.CanvasTexture(c)
        textures.set(key, t)
      }
      return t
    }
    const label = (text: string, color: string, scale: number) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTex(text, color), transparent: true, depthTest: false }))
      s.scale.set(scale * 4, scale, 1)
      s.renderOrder = 10
      return s
    }

    const accent = cssVar(wrap, '--accent-bright')
    const whiteHex = cssVar(wrap, '--white')
    const yellow = cssVar(wrap, '--yellow')

    // ---------- chickens ----------
    type Rig = { group: THREE.Group; body: THREE.Group; wingL: THREE.Mesh; wingR: THREE.Mesh; prevHp: number; squash: number }
    const rigs: Rig[] = w.chickens.map(c => {
      const group = new THREE.Group()
      const body = new THREE.Group()
      group.add(body)

      const add = (mesh: THREE.Mesh, x: number, y: number, z: number, s: [number, number, number] = [1, 1, 1]) => {
        mesh.position.set(x, y, z)
        mesh.scale.set(...s)
        mesh.castShadow = true
        body.add(mesh)
        return mesh
      }
      add(new THREE.Mesh(geo.body, white), 0, 0.75, 0, [1, 0.9, 1.15])
      add(new THREE.Mesh(geo.head, white), 0, 1.4, 0.4)
      const beak = add(new THREE.Mesh(geo.beak, orange), 0, 1.36, 0.75)
      beak.rotation.x = Math.PI / 2
      add(new THREE.Mesh(geo.comb, red), 0, 1.75, 0.42, [0.8, 1.3, 1.6])
      add(new THREE.Mesh(geo.comb, red), 0, 1.66, 0.62, [0.6, 1, 0.8])
      add(new THREE.Mesh(geo.comb, red), 0, 1.2, 0.68, [0.6, 1.2, 0.6])
      add(new THREE.Mesh(geo.eye, black), -0.15, 1.5, 0.66)
      add(new THREE.Mesh(geo.eye, black), 0.15, 1.5, 0.66)
      add(new THREE.Mesh(geo.comb, white), 0, 1.1, -0.72, [1.6, 2.6, 1.2])
      const wingL = add(new THREE.Mesh(geo.wing, white), -0.6, 0.8, 0, [0.35, 0.8, 1])
      const wingR = add(new THREE.Mesh(geo.wing, white), 0.6, 0.8, 0, [0.35, 0.8, 1])
      const scarf = add(new THREE.Mesh(geo.scarf, std(new THREE.Color().setHSL(c.hue / 360, 0.8, 0.5))), 0, 1.1, 0.32)
      scarf.rotation.x = Math.PI / 2 - 0.4

      for (const x of [-0.2, 0.2]) {
        const leg = new THREE.Mesh(geo.leg, orange)
        leg.position.set(x, 0.2, 0)
        group.add(leg)
      }

      const name = label(c.name, c.human ? accent : whiteHex, 0.45)
      name.position.y = 2.5
      group.add(name)
      if (c.human) {
        const arrow = new THREE.Mesh(geo.arrow, new THREE.MeshBasicMaterial({ color: yellow }))
        arrow.rotation.x = Math.PI
        arrow.position.y = 2.15
        group.add(arrow)
      }
      scene.add(group)
      return { group, body, wingL, wingR, prevHp: MAX_HP, squash: 0 }
    })

    // ---------- eggs / pickups / effects ----------
    const eggMeshes: THREE.Mesh[] = []
    const eggMesh = (goldEgg: boolean) => {
      const m = new THREE.Mesh(geo.egg, goldEgg ? gold : eggMat)
      m.scale.set(0.8, 1, 0.8)
      m.castShadow = true
      scene.add(m)
      return m
    }
    const pickupMeshes: THREE.Mesh[] = []

    type Bit = { mesh: THREE.Object3D; vx: number; vy: number; vz: number; life: number; max: number; kind: 'bit' | 'text' | 'ring' }
    const bits: Bit[] = []
    const bitMats = new Map<string, THREE.MeshStandardMaterial>()
    const bitMat = (color: string) => {
      let m = bitMats.get(color)
      if (!m) { m = std(color); bitMats.set(color, m) }
      return m
    }
    const burst = (x: number, z: number, color: string, n: number, power: number) => {
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(geo.bit, bitMat(color))
        m.position.set(x, 1, z)
        m.scale.setScalar(0.5 + Math.random() * 0.7)
        scene.add(m)
        const a = Math.random() * Math.PI * 2
        const sp = power * (0.4 + Math.random())
        bits.push({ mesh: m, vx: Math.cos(a) * sp, vy: 3 + Math.random() * 5, vz: Math.sin(a) * sp, life: 0.9, max: 0.9, kind: 'bit' })
      }
    }
    const popText = (x: number, z: number, text: string, color: string) => {
      const s = label(text, color, 0.7)
      s.position.set(x, 2.6, z)
      scene.add(s)
      bits.push({ mesh: s, vx: 0, vy: 2.2, vz: 0, life: 0.9, max: 0.9, kind: 'text' })
    }
    const boomRing = (x: number, z: number) => {
      const m = new THREE.Mesh(geo.ring, new THREE.MeshBasicMaterial({ color: yellow, transparent: true, side: THREE.DoubleSide }))
      m.rotation.x = -Math.PI / 2
      m.position.set(x, 0.1, z)
      scene.add(m)
      bits.push({ mesh: m, vx: 0, vy: 0, vz: 0, life: 0.45, max: 0.45, kind: 'ring' })
    }

    const onEvent = (e: GameEvent) => {
      switch (e.type) {
        case 'hit':
          burst(e.x, e.z, '#ffffff', 7, 4)
          popText(e.x, e.z, HIT_TEXTS[Math.floor(Math.random() * HIT_TEXTS.length)], whiteHex)
          break
        case 'splat': burst(e.x, e.z, e.gold ? yellow : '#ffd23f', 4, 2.5); break
        case 'boom':
          boomRing(e.x, e.z)
          burst(e.x, e.z, '#ff9f1c', 14, 6)
          popText(e.x, e.z, 'BOOM!', yellow)
          break
        case 'cooked':
          burst(e.x, e.z, '#ffffff', 14, 5)
          burst(e.x, e.z, '#c2703d', 6, 4)
          popText(e.x, e.z, 'COOKED!', cssVar(wrap, '--lose') || '#f87171')
          break
        case 'splash':
          burst(e.x, e.z, cssVar(wrap, '--accent'), 14, 4)
          popText(e.x, e.z, 'SPLASH!', accent)
          break
        case 'gold': popText(e.x, e.z, 'GOLDEN EGGS!', yellow); break
        default: break
      }
    }

    // ---------- input ----------
    const keys = new Set<string>()
    const kd = (e: KeyboardEvent) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault()
      keys.add(e.code)
    }
    const ku = (e: KeyboardEvent) => keys.delete(e.code)
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)

    const ray = new THREE.Raycaster()
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const ndc = new THREE.Vector2()
    const aimPt = new THREE.Vector3()
    let pointerDown = false
    let touching = false
    const setPointer = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      touching = e.pointerType === 'touch'
    }
    const pd = (e: PointerEvent) => { setPointer(e); pointerDown = true }
    const pm = (e: PointerEvent) => setPointer(e)
    const pu = () => { pointerDown = false; touching = false }
    const dom = renderer.domElement
    dom.addEventListener('pointerdown', pd)
    dom.addEventListener('pointermove', pm)
    window.addEventListener('pointerup', pu)

    // ---------- loop ----------
    let raf = 0
    let last = performance.now()
    let hudAt = 0
    const cam = new THREE.Vector3()
    const me = w.chickens.find(c => c.human)!
    cam.set(me.x, 0, me.z)

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now

      ray.setFromCamera(ndc, camera)
      const hit = ray.ray.intersectPlane(ground, aimPt)
      let mx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0)
      let mz = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0)
      let angle = me.angle
      if (hit) {
        angle = Math.atan2(aimPt.z - me.z, aimPt.x - me.x)
        // on touch there are no keys: walk toward the finger
        if (touching && Math.hypot(aimPt.x - me.x, aimPt.z - me.z) > 1.2) { mx = Math.cos(angle); mz = Math.sin(angle) }
      }
      step(w, dt, { mx, mz, angle, fire: pointerDown || keys.has('Space') })

      for (const e of w.events) onEvent(e)
      w.events.length = 0

      // arena shrink
      const R = arenaRadius(w.t)
      island.scale.set(R, 1, R)
      rim.scale.set(R, R, 1)

      // chickens
      const tt = now / 1000
      w.chickens.forEach((c, i) => {
        const rig = rigs[i]
        rig.group.visible = c.alive
        if (!c.alive) return
        if (c.hp < rig.prevHp) rig.squash = 1
        rig.prevHp = c.hp
        rig.squash = Math.max(0, rig.squash - dt * 4)

        const moving = Math.hypot(c.moveX, c.moveZ) > 0.1
        const bob = moving ? Math.abs(Math.sin(tt * 14 + i)) * 0.18 : Math.sin(tt * 3 + i) * 0.03
        rig.group.position.set(c.x, bob, c.z)
        rig.group.rotation.y = Math.PI / 2 - c.angle
        const s = 1 + rig.squash * 0.25
        rig.body.scale.set(s, 1 - rig.squash * 0.2, s)
        const flap = c.falling > 0 ? Math.sin(tt * 40) * 0.9 : moving ? Math.sin(tt * 14 + i) * 0.35 : 0
        rig.wingL.rotation.z = 0.3 + flap
        rig.wingR.rotation.z = -0.3 - flap
        if (c.falling > 0) {
          rig.group.position.y = -c.falling * 7
          rig.group.rotation.z = c.falling * 6
        } else {
          rig.group.rotation.z = 0
        }
      })

      // eggs
      while (eggMeshes.length < w.eggs.length) eggMeshes.push(eggMesh(false))
      while (eggMeshes.length > w.eggs.length) { const m = eggMeshes.pop()!; scene.remove(m) }
      w.eggs.forEach((e, i) => {
        const m = eggMeshes[i]
        m.material = e.gold ? gold : eggMat
        const arc = Math.sin((1 - e.life / 1.1) * Math.PI)
        m.position.set(e.x, 1 + arc * 0.4, e.z)
        m.rotation.x += 0.4
      })

      // golden pickups
      while (pickupMeshes.length < w.pickups.length) {
        const m = new THREE.Mesh(geo.egg, gold)
        m.scale.setScalar(1.6)
        m.castShadow = true
        scene.add(m)
        pickupMeshes.push(m)
      }
      while (pickupMeshes.length > w.pickups.length) { const m = pickupMeshes.pop()!; scene.remove(m) }
      w.pickups.forEach((p, i) => {
        pickupMeshes[i].position.set(p.x, 0.9 + Math.sin(tt * 4) * 0.2, p.z)
        pickupMeshes[i].rotation.y = tt * 2
      })

      // particles
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i]
        b.life -= dt
        const k = Math.max(0, b.life / b.max)
        if (b.kind === 'ring') {
          b.mesh.scale.setScalar(1 + (1 - k) * 2.8)
          ;((b.mesh as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = k
        } else {
          b.vy -= (b.kind === 'text' ? 0 : 14) * dt
          b.mesh.position.x += b.vx * dt
          b.mesh.position.y += b.vy * dt
          b.mesh.position.z += b.vz * dt
          if (b.kind === 'bit') b.mesh.rotation.x += 8 * dt
          else ((b.mesh as THREE.Sprite).material as THREE.SpriteMaterial).opacity = Math.min(1, k * 2.5)
        }
        if (b.life <= 0) {
          scene.remove(b.mesh)
          if (b.kind !== 'bit') ((b.mesh as THREE.Mesh).material as THREE.Material).dispose()
          bits.splice(i, 1)
        }
      }

      // camera follows you, or the healthiest chicken once you're out
      const focus = me.alive ? me : w.chickens.filter(c => c.alive).sort((a, b) => b.hp - a.hp)[0] ?? me
      cam.x += (focus.x - cam.x) * Math.min(1, dt * 4)
      cam.z += (focus.z - cam.z) * Math.min(1, dt * 4)
      camera.position.set(cam.x, 15, cam.z + 11)
      camera.lookAt(cam.x, 0, cam.z)

      renderer.render(scene, camera)

      if (w.over) {
        cancelAnimationFrame(raf)
        setHud(null)
        finish(w)
        return
      }

      if (now - hudAt > 100) {
        hudAt = now
        setHud({
          t: w.t,
          alive: w.chickens.filter(c => c.alive).length,
          hp: me.hp,
          gold: me.gold,
          kills: me.kills,
          me: me.alive,
          board: [...w.chickens]
            .sort((a, b) => Number(b.alive) - Number(a.alive) || b.hp - a.hp || b.kills - a.kills)
            .slice(0, 5)
            .map(c => ({ name: c.name, hp: c.hp, me: c.human, alive: c.alive })),
        })
      }
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      window.removeEventListener('pointerup', pu)
      dom.removeEventListener('pointerdown', pd)
      dom.removeEventListener('pointermove', pm)
      scene.traverse(o => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const mat = m.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach(x => x.dispose())
        else mat?.dispose()
      })
      textures.forEach(t => t.dispose())
      renderer.dispose()
      dom.remove()
    }
  }, [phase, finish])

  const timeLeft = hud ? Math.max(0, Math.ceil(ROUND_SEC - hud.t)) : ROUND_SEC

  return (
    <div className="sl">
      <div className="sl-top">
        <div className="dc-balance">
          <span>Demo balance</span>
          <b>{balance.toFixed(2)}</b>
        </div>
        <button className="dc-reset" onClick={reset} title="Reset demo balance">
          <RotateCcw size={14} /> Reset
        </button>
      </div>

      {phase === 'lobby' && (
        <div className="sl-lobby">
          <h2>Chicken Royale</h2>
          <p>10 chickens, 1 tiny island, 1 minute. Pelt rivals with eggs, grab golden eggs for explosive shots, and knock everyone into the sea while the island shrinks. Last chicken standing takes the pool.</p>
          <p><b>WASD</b> / arrows move · mouse aims · click or <b>Space</b> throws (touch: hold a finger where you want to go).</p>
          <div className="sl-lobby-grid">
            <div>
              <label className="dc-label">Buy-in</label>
              <div className="dc-bet">
                <input type="number" min="0" step="0.01" value={bet} onChange={e => setBet(e.target.value)} />
                <button onClick={() => setBet(b => String(round2(Math.max(0.01, (parseFloat(b) || 0.02) / 2))))}>½</button>
                <button onClick={() => setBet(b => String(round2((parseFloat(b) || 0) * 2)))}>2×</button>
              </div>
            </div>
            <div className="dc-field"><span>Players</span><b>You + 9 bots</b></div>
            <div className="dc-field"><span>Prize pool</span><b>{pool.toFixed(2)}</b></div>
          </div>
          <button className="dc-roll" onClick={start}>Join round</button>
          {error && <p className="dc-error">{error}</p>}
        </div>
      )}

      {phase !== 'lobby' && (
        <div className="sl-stage" ref={wrapRef}>
          {hud && (
            <>
              <div className="sl-hud sl-hud--tl">
                <div className="sl-chip"><span>Time</span><b>{timeLeft}s</b></div>
                <div className="sl-chip"><span>Alive</span><b>{hud.alive}/{PLAYERS}</b></div>
                <div className="sl-chip"><span>Kills</span><b>{hud.kills}</b></div>
                <div className="sl-chip"><span>Pool</span><b>{pool.toFixed(2)}</b></div>
              </div>

              <div className="sl-hud sl-hud--tr">
                {hud.board.map(b => (
                  <div key={b.name} className={`sl-row${b.me ? ' sl-row--me' : ''}${b.alive ? '' : ' sl-row--dead'}`}>
                    <span>{b.name}</span><b>{'♥'.repeat(Math.max(0, b.hp))}</b>
                  </div>
                ))}
              </div>

              <div className="sl-hud sl-hud--bottom">
                <div className="sl-hp"><div className="sl-hp-fill" style={{ width: `${(hud.hp / MAX_HP) * 100}%` }} /></div>
                <small>
                  {hud.me
                    ? `HP ${hud.hp}/${MAX_HP}${hud.gold ? ` · ${hud.gold} golden egg${hud.gold > 1 ? 's' : ''} ready` : ''}`
                    : 'You were eliminated'}
                </small>
                {!hud.me && (
                  <button className="gp-btn" onClick={skip}><FastForward size={15} /> Skip to result</button>
                )}
              </div>
            </>
          )}

          {phase === 'done' && result && (
            <div className="sl-result">
              <div className={`sl-result-card${result.payout > 0 ? ' sl-result-card--win' : ''}`}>
                {result.payout > 0 ? <Trophy size={34} /> : <Skull size={34} />}
                <h2>{result.payout > 0 ? `Winner winner, chicken dinner! +${result.payout.toFixed(2)}` : `Placed #${result.place}`}</h2>
                <p>{result.payout > 0 ? 'Last chicken standing.' : `You lost ${result.stake.toFixed(2)}.`} Kills: {result.kills}</p>
                <div className="sl-result-btns">
                  <button className="dc-roll" onClick={start}>Play again</button>
                  <button className="gp-btn" onClick={() => setPhase('lobby')}>Change bet</button>
                </div>
                {error && <p className="dc-error">{error}</p>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default Chicken
