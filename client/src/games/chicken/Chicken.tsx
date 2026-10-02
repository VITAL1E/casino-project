import * as THREE from 'three'
import NetShell, { type NetAdapter } from '../net/NetShell'
import { setTarget, easeToTargets } from '../net/smooth'
import { arenaRadius, MAX_HP, EGG_LIFE, R_START, type World, type Chicken as ChickenEntity, type GameEvent } from './engine'
import type { ChickenSnap } from './net'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import ChickenHud, { type ChickenUi, type FeedItem } from './ChickenHud'
import { Sfx } from './audio'
import { Fx, Labels, animateChicken, buildChicken, createEnvironment, makeGlowTexture, outline, toon } from './visuals'

const cssVar = (el: Element, name: string) => getComputedStyle(el).getPropertyValue(name).trim()

const HIT_TEXTS = ['BAWK!', 'OUCH!', 'CLUCK!', 'EGG-STRA!', 'SHELL YEAH']

const adapter: NetAdapter<World, ChickenSnap> = {
  key: 'chicken',
  title: 'Chicken Royale',
  stageClass: 'st-stage',
  blurb: '10 chickens, 1 tiny island, 1 minute. Pelt rivals with eggs, grab golden eggs for explosive shots, and knock everyone into the sea while the island shrinks. Last chicken standing takes the pool. Third-person: WASD moves, the mouse looks and aims, click or Space throws. Desktop only.',

  create: (you, seats) => {
    const chickens: ChickenEntity[] = seats.map(s => ({
      id: s.id, name: s.name, hue: s.hue, human: s.id === you, auto: false,
      x: 0, z: 0, vx: 0, vz: 0, angle: 0, moveX: 0, moveZ: 0, hp: MAX_HP, cooldown: 0, gold: 0, alive: true,
      falling: 0, kills: 0, place: 0, skill: 0, think: 0, fire: false,
    }))
    return { t: 0, chickens, eggs: [], pickups: [], events: [], pickupTimer: 0, over: false, winner: -1 }
  },

  apply: (w, snap) => {
    w.t = snap.t
    for (const s of snap.chickens) {
      const c = w.chickens[s.id]
      setTarget(c, s.x, undefined, s.z)
      c.vx = s.vx; c.vz = s.vz; c.angle = s.angle; c.moveX = s.mx; c.moveZ = s.mz
      c.hp = s.hp; c.gold = s.gold; c.alive = s.al; c.falling = s.falling; c.kills = s.k; c.place = s.p
    }
    w.eggs = snap.eggs.map(([x, z, vx, vz, life, owner, gold]) => ({ x, z, vx, vz, life, owner, gold: gold === 1 }))
    w.pickups = snap.pickups.map(([x, z]) => ({ x, z }))
    w.events.push(...snap.events)   // consumed (and cleared) by the render loop
  },

  hud: w => {
    const me = w.chickens.find(c => c.human)!
    return {
      t: w.t,
      chips: [
        { label: 'Alive', value: `${w.chickens.filter(c => c.alive).length}/${w.chickens.length}` },
        { label: 'Kills', value: String(me.kills) },
      ],
      board: [...w.chickens]
        .sort((a, b) => Number(b.alive) - Number(a.alive) || b.hp - a.hp || b.kills - a.kills)
        .slice(0, 5)
        .map(c => ({ name: c.name, value: '♥'.repeat(Math.max(0, c.hp)), me: c.human, alive: c.alive })),
      note: me.alive
        ? `HP ${me.hp}/${MAX_HP}${me.gold ? ` · ${me.gold} golden egg${me.gold > 1 ? 's' : ''} ready` : ''}`
        : 'You were eliminated',
      me: me.alive,
      bar: { value: me.hp, max: MAX_HP },
    }
  },

  overlay: ({ hud, ui, timeLeft, pool }) => <ChickenHud ui={ui as ChickenUi | null} begin={hud?.begin ?? 0} timeLeft={timeLeft} pool={pool} />,

  mount: (wrap, api) => {
    const w = api.world()

    // ---------- renderer: filmic tone mapping + soft shadows ----------
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.shadowMap.enabled = true
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.domElement.className = 'sl-canvas'
    wrap.prepend(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 600)

    // post: MSAA scene target -> bloom (golden eggs, sun glints, explosions) -> tone map + sRGB
    const target = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 })
    const composer = new EffectComposer(renderer, target)
    composer.addPass(new RenderPass(scene, camera))
    const bloom = new UnrealBloomPass(new THREE.Vector2(2, 2), 0.32, 0.65, 0.88)
    composer.addPass(bloom)
    composer.addPass(new OutputPass())

    const resize = () => {
      const W = wrap.clientWidth, H = wrap.clientHeight
      renderer.setSize(W, H)
      composer.setPixelRatio(renderer.getPixelRatio())
      composer.setSize(W, H)
      camera.aspect = W / H
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const env = createEnvironment(scene, R_START)
    const labels = new Labels()
    const glowTex = makeGlowTexture()
    const helpers = { labels, glowTex, maxHp: MAX_HP }
    const accent = cssVar(wrap, '--accent-bright')
    const whiteHex = cssVar(wrap, '--white')
    const yellow = cssVar(wrap, '--yellow')
    const lose = cssVar(wrap, '--lose') || '#f87171'

    const rigs = w.chickens.map((c, i) => buildChicken(scene, c, i, helpers, { accent, white: whiteHex, yellow }))
    const fx = new Fx(scene, glowTex)

    // ---------- eggs and golden pickups ----------
    const eggGeo = new THREE.SphereGeometry(0.27, 18, 14)
    const eggMat = toon(0xfffdf5)
    const goldMat = toon(0xffd23f, { emissive: 0xffa800, emissiveIntensity: 0.9 })
    type EggView = { group: THREE.Group; mesh: THREE.Mesh; glow: THREE.Sprite; gold: boolean }
    const eggViews: EggView[] = []
    const makeEgg = (): EggView => {
      const group = new THREE.Group()
      const mesh = new THREE.Mesh(eggGeo, eggMat)
      mesh.scale.set(0.8, 1, 0.8)
      mesh.castShadow = true
      outline(mesh, 1.1)
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd23f, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }))
      glow.scale.set(1.8, 1.8, 1)
      group.add(mesh, glow)
      scene.add(group)
      return { group, mesh, glow, gold: false }
    }
    type PickupView = { group: THREE.Group; glow: THREE.Sprite }
    const pickupViews: PickupView[] = []
    const makePickup = (): PickupView => {
      const group = new THREE.Group()
      const mesh = new THREE.Mesh(eggGeo, goldMat)
      mesh.scale.set(1.45, 1.8, 1.45)
      mesh.castShadow = true
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd23f, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 }))
      glow.scale.set(3.6, 3.6, 1)
      group.add(mesh, glow)
      scene.add(group)
      return { group, glow }
    }

    // ---------- feedback overlays (plain DOM over the canvas) ----------
    const dmg = document.createElement('div')
    dmg.className = 'ck-dmg'
    const low = document.createElement('div')
    low.className = 'ck-low'
    wrap.append(dmg, low)
    let dmgAlpha = 0

    // ---------- events -> animations and effects ----------
    const me = w.chickens.find(c => c.human)!
    const meIdx = w.chickens.indexOf(me)
    const sfx = new Sfx()
    const view = { yaw: me.angle, pitch: 0.42 }   // pitch = how high the camera sits above the chicken
    const feed: (FeedItem & { until: number })[] = []
    let feedId = 0
    let hitmarkUntil = 0
    let lastFire = -9
    let uiAt = 0
    let beat = 0
    const nameOf = (hue: number) => w.chickens.find(c => c.hue === hue)?.name ?? 'Someone'
    const pushFeed = (str: string, mine: boolean) => { feed.push({ id: feedId++, text: str, mine, until: performance.now() + 5500 }); if (feed.length > 5) feed.shift() }
    const near = (x: number, z: number) => {   // loudness and stereo pan relative to the player's view
      const d = Math.hypot(x - me.x, z - me.z)
      return { gain: Math.max(0, 1 - d / 32), pan: ((x - me.x) * -Math.sin(view.yaw) + (z - me.z) * Math.cos(view.yaw)) / 18 }
    }

    // minimap (bottom-left) and aim guide dots
    const mini = document.createElement('canvas')
    mini.className = 'ck-mini'
    mini.width = mini.height = 160
    wrap.append(mini)
    const mctx = mini.getContext('2d')
    const aimDots = Array.from({ length: 7 }, (_, i) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, opacity: 0.55 - i * 0.055, depthWrite: false }))
      sp.scale.setScalar(0.3 - i * 0.02)
      sp.visible = false
      scene.add(sp)
      return sp
    })
    const surface = cssVar(wrap, '--surface')
    let trauma = 0                                              // camera shake, decays quickly
    const byHue = (hue: number) => w.chickens.findIndex(c => c.hue === hue)
    const nearest = (x: number, z: number) => {
      let best = -1, bd = 1.6
      w.chickens.forEach((c, i) => { const d = Math.hypot(c.x - x, c.z - z); if (c.alive && d < bd) { bd = d; best = i } })
      return best
    }
    const shake = (x: number, z: number, amount: number) => {
      const d = Math.hypot(me.x - x, me.z - z)
      trauma = Math.min(1, trauma + amount * Math.max(0, 1 - d / 22))
    }
    const text = (x: number, z: number, str: string, color: string, y = 2.4) => fx.popText(labels.text(str, color, 0.7), x, y, z)

    const onEvent = (e: GameEvent) => {
      switch (e.type) {
        case 'throw': {
          const k = nearest(e.x, e.z)
          if (k >= 0) rigs[k].throwT = 1
          fx.puff(e.x, 1.0, e.z, 0xffffff, 0.5)
          sfx.throw(near(e.x, e.z))
          break
        }
        case 'hit': {
          const k = byHue(e.hue)
          if (k >= 0) rigs[k].hitT = 1
          fx.feathers(e.x, 1.1, e.z, 7)
          fx.star(e.x, 1.2, e.z, 0xfff3c0, 1.5)
          text(e.x, e.z, HIT_TEXTS[Math.floor(Math.random() * HIT_TEXTS.length)], whiteHex)
          if (k === meIdx) { dmgAlpha = 0.55; trauma = Math.min(1, trauma + 0.45) } else {
            shake(e.x, e.z, 0.12)
            if (performance.now() / 1000 - lastFire < 0.9) hitmarkUntil = performance.now() + 160
          }
          sfx.hit(near(e.x, e.z))
          break
        }
        case 'splat':
          fx.groundSplat(e.x, e.z, e.gold)
          fx.bits(e.x, 0.3, e.z, e.gold ? 0xffd23f : 0xfffdf5, 5, 2.5)
          fx.puff(e.x, 0.3, e.z, 0xfff7e0, 0.7)
          sfx.splat(near(e.x, e.z))
          break
        case 'boom':
          fx.ripple(e.x, 0.1, e.z, 0xffc83a, 6.5, 0.55)
          fx.ripple(e.x, 0.12, e.z, 0xffffff, 4.2, 0.4)
          fx.puff(e.x, 0.7, e.z, 0xffb347, 1.9, 6)
          fx.puff(e.x, 1.2, e.z, 0x666a75, 1.4, 4)
          fx.bits(e.x, 0.6, e.z, 0xff9f1c, 16, 7)
          fx.star(e.x, 1.0, e.z, 0xffe08a, 4)
          text(e.x, e.z, 'BOOM!', yellow, 2.8)
          shake(e.x, e.z, 0.7)
          sfx.boom(near(e.x, e.z))
          break
        case 'cooked': {
          fx.feathers(e.x, 1.0, e.z, 22)
          fx.puff(e.x, 0.8, e.z, 0x5a5560, 1.6, 5)
          fx.bits(e.x, 0.9, e.z, 0xc2703d, 8, 5)
          fx.star(e.x, 1.2, e.z, 0xffffff, 2.4)
          text(e.x, e.z, 'COOKED!', lose, 2.8)
          shake(e.x, e.z, 0.3)
          sfx.cooked(near(e.x, e.z))
          pushFeed(e.by >= 0 ? `${nameOf(e.by)} cooked ${nameOf(e.hue)}` : `${nameOf(e.hue)} got cooked`, e.by === me.hue || e.hue === me.hue)
          break
        }
        case 'splash':
          fx.drops(e.x, e.z, 16)
          fx.ripple(e.x, -1.55, e.z, 0xffffff, 4, 1.1)
          fx.ripple(e.x, -1.55, e.z, 0xbfe9ff, 2.6, 0.8)
          text(e.x, e.z, 'SPLASH!', accent, 0.6)
          sfx.splash(near(e.x, e.z))
          pushFeed(`${nameOf(e.hue)} fell in the sea`, e.hue === me.hue)
          break
        case 'gold':
          fx.star(e.x, 1.4, e.z, 0xffd23f, 2.6)
          fx.puff(e.x, 1.0, e.z, 0xffd23f, 1.2, 3)
          text(e.x, e.z, 'GOLDEN EGGS!', yellow)
          sfx.pickup(near(e.x, e.z))
          break
        default: break
      }
    }

    // ---------- input: mouse look (pointer lock) + WASD relative to the camera ----------
    let fireHeld = false
    const keys = new Set<string>()
    const kd = (e: KeyboardEvent) => {
      sfx.unlock()
      if (e.code === 'KeyM' && !e.repeat) sfx.setMuted(!sfx.muted)
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault()
      keys.add(e.code)
    }
    const ku = (e: KeyboardEvent) => keys.delete(e.code)
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)

    const dom = renderer.domElement
    const locked = () => document.pointerLockElement === dom
    const mm = (e: MouseEvent) => {
      if (!locked()) return
      view.yaw += e.movementX * 0.0025
      view.pitch = Math.max(0.05, Math.min(1.15, view.pitch + e.movementY * 0.0025))
    }
    const md = (e: MouseEvent) => { sfx.unlock(); if (e.button !== 0) return; if (locked()) fireHeld = true; else if (me.alive) dom.requestPointerLock?.() }
    const mu = (e: MouseEvent) => { if (e.button === 0) fireHeld = false }
    document.addEventListener('mousemove', mm)
    dom.addEventListener('mousedown', md)
    window.addEventListener('mouseup', mu)

    // crosshair + "click to play" prompt
    const cross = document.createElement('div')
    cross.className = 'st-cross'
    const lockBtn = document.createElement('button')
    lockBtn.className = 'st-lock'
    lockBtn.innerHTML = '<b>Click to play</b><span>WASD move · Mouse look &amp; aim · Click or Space throws eggs</span>'
    lockBtn.onclick = () => { sfx.unlock(); dom.requestPointerLock?.() }
    wrap.append(cross, lockBtn)
    const plc = () => { if (!locked()) fireHeld = false }
    document.addEventListener('pointerlockchange', plc)

    // ---------- loop ----------
    let raf = 0
    let last = performance.now()
    const camPos = new THREE.Vector3(me.x, 4, me.z)
    const camLook = new THREE.Vector3(me.x, 1, me.z)
    const wantPos = new THREE.Vector3()
    const wantLook = new THREE.Vector3()
    let fov = 62

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const tt = now / 1000

      const fx_ = Math.cos(view.yaw), fz_ = Math.sin(view.yaw)
      const rx = -Math.sin(view.yaw), rz = Math.cos(view.yaw)
      const fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0)
      const rgt = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0)
      const firing = (fireHeld && locked()) || keys.has('Space')
      if (firing && me.alive) lastFire = tt
      api.send({ mx: fx_ * fwd + rx * rgt, mz: fz_ * fwd + rz * rgt, angle: view.yaw, fire: firing })
      easeToTargets(w.chickens, dt)
      for (const e of w.eggs) { e.x += e.vx * dt; e.z += e.vz * dt }   // keep fast eggs moving between snapshots

      for (const e of w.events) onEvent(e)
      w.events.length = 0

      const R = arenaRadius(w.t)
      const focus = me.alive ? me : w.chickens.filter(c => c.alive).sort((a, b) => b.hp - a.hp)[0] ?? me

      // chickens
      w.chickens.forEach((c, i) => {
        const rig = rigs[i]
        if (c.hp < rig.prevHp && rig.hitT < 0.4) rig.hitT = 1   // hits that arrive without an event still flinch
        rig.prevHp = c.hp
        animateChicken(rig, c, i, tt, dt, helpers)
      })

      // eggs: spin, arc, leave a trail; golden ones glow
      while (eggViews.length < w.eggs.length) eggViews.push(makeEgg())
      while (eggViews.length > w.eggs.length) { const v = eggViews.pop()!; scene.remove(v.group); v.glow.material.dispose() }
      w.eggs.forEach((e, i) => {
        const v = eggViews[i]
        if (v.gold !== e.gold) { v.gold = e.gold; v.mesh.material = e.gold ? goldMat : eggMat; (v.glow.material as THREE.SpriteMaterial).opacity = e.gold ? 0.9 : 0 }
        const arc = Math.sin((1 - e.life / EGG_LIFE) * Math.PI)
        v.group.position.set(e.x, 1.05 + arc * 0.45, e.z)
        v.mesh.rotation.x += 12 * dt
        v.mesh.rotation.z += 6 * dt
        if (Math.random() < (e.gold ? 0.7 : 0.35)) fx.puff(e.x, 1.05 + arc * 0.45, e.z, e.gold ? 0xffd23f : 0xffffff, e.gold ? 0.5 : 0.32)
      })

      // golden pickups bob, spin and sparkle
      while (pickupViews.length < w.pickups.length) pickupViews.push(makePickup())
      while (pickupViews.length > w.pickups.length) { const v = pickupViews.pop()!; scene.remove(v.group); v.glow.material.dispose() }
      w.pickups.forEach((p, i) => {
        const v = pickupViews[i]
        v.group.position.set(p.x, 1.0 + Math.sin(tt * 3 + i) * 0.2, p.z)
        v.group.rotation.y = tt * 2
        v.glow.scale.setScalar(3.4 + Math.sin(tt * 5) * 0.4)
        if (Math.random() < 0.08) fx.star(p.x + (Math.random() - 0.5), 1.2 + Math.random(), p.z + (Math.random() - 0.5), 0xfff0a0, 0.7)
      })

      fx.update(dt)

      // ---------- camera: over-the-shoulder spring follow, FOV kick and shake ----------
      const dist = 6.4, cp = Math.cos(view.pitch), sp = Math.sin(view.pitch)
      wantPos.set(focus.x - fx_ * dist * cp + rx * 1.0, 1.4 + sp * dist + 0.5, focus.z - fz_ * dist * cp + rz * 1.0)
      wantLook.set(focus.x + fx_ * 7, 1.1, focus.z + fz_ * 7)
      const follow = 1 - Math.exp(-dt * 16)
      camPos.lerp(wantPos, follow)
      camLook.lerp(wantLook, follow)
      trauma = Math.max(0, trauma - dt * 1.6)
      const sh = trauma * trauma * 0.4
      camera.position.set(camPos.x + (Math.random() - 0.5) * sh, camPos.y + (Math.random() - 0.5) * sh, camPos.z + (Math.random() - 0.5) * sh)
      camera.lookAt(camLook)
      const mine = rigs[w.chickens.indexOf(focus)]
      const fovWant = 62 + Math.min(1, mine.speed / 5.5) * 5 + (focus === me && firing ? 1.5 : 0)
      fov += (fovWant - fov) * Math.min(1, dt * 6)
      if (Math.abs(camera.fov - fov) > 0.02) { camera.fov = fov; camera.updateProjectionMatrix() }

      env.update(tt, dt, R, camera.position)
      env.sun.position.set(focus.x + 14, 24, focus.z + 10)
      env.sun.target.position.set(focus.x, 0, focus.z)
      env.sun.target.updateMatrixWorld()

      // crown on whoever leads (needs at least one kill)
      let leader = -1
      w.chickens.forEach((c, i) => {
        if (!c.alive || c.kills < 1) return
        const l = leader < 0 ? null : w.chickens[leader]
        if (!l || c.kills > l.kills || (c.kills === l.kills && c.hp > l.hp)) leader = i
      })
      rigs.forEach((r, i) => {
        r.crown.visible = i === leader
        if (i === leader) r.crown.rotation.y = tt * 1.5
      })

      // aim guide: a fading dotted line along the throw direction
      const aiming = locked() && me.alive
      aimDots.forEach((d, i) => {
        d.visible = aiming
        if (aiming) d.position.set(me.x + fx_ * (2.4 + i * 1.7), 0.35, me.z + fz_ * (2.4 + i * 1.7))
      })

      // low health heartbeat
      beat -= dt
      if (me.alive && me.hp <= 2 && beat <= 0) { beat = 0.9; sfx.lowHealth() }

      // minimap
      if (mctx) {
        const S = 160, k = (S / 2 - 8) / R_START
        mctx.clearRect(0, 0, S, S)
        mctx.fillStyle = surface
        mctx.globalAlpha = 0.8
        mctx.beginPath(); mctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); mctx.fill()
        mctx.globalAlpha = 1
        mctx.strokeStyle = accent
        mctx.lineWidth = 2
        mctx.beginPath(); mctx.arc(S / 2, S / 2, R * k, 0, Math.PI * 2); mctx.stroke()
        // rotate so "up" on the map is where the player is looking
        const ca = Math.cos(-view.yaw - Math.PI / 2), sa = Math.sin(-view.yaw - Math.PI / 2)
        const proj = (x: number, z: number) => [S / 2 + (x * ca - z * sa) * k, S / 2 + (x * sa + z * ca) * k]
        for (const p of w.pickups) { const [px, py] = proj(p.x, p.z); mctx.fillStyle = yellow; mctx.fillRect(px - 2, py - 2, 4, 4) }
        w.chickens.forEach(c => {
          if (!c.alive) return
          const [px, py] = proj(c.x, c.z)
          mctx.fillStyle = c === me ? whiteHex : `hsl(${c.hue} 80% 60%)`
          mctx.beginPath(); mctx.arc(px, py, c === me ? 4.5 : 3.5, 0, Math.PI * 2); mctx.fill()
        })
      }

      // HUD state (5 Hz is plenty for React)
      const nowMs = performance.now()
      if (nowMs - uiAt > 200) {
        uiAt = nowMs
        while (feed.length && feed[0].until < nowMs) feed.shift()
        const board = [...w.chickens]
          .sort((a, b) => Number(b.alive) - Number(a.alive) || b.hp - a.hp || b.kills - a.kills)
          .slice(0, 6).map(c => ({ name: c.name, hp: c.hp, kills: c.kills, me: c.human, alive: c.alive }))
        const ui: ChickenUi = {
          t: w.t, alive: w.chickens.filter(c => c.alive).length, total: w.chickens.length, kills: me.kills, hp: me.hp, gold: me.gold,
          me: me.alive, place: me.place, radius: R, board, feed: feed.map(({ id, text: tx, mine }) => ({ id, text: tx, mine })),
          hitmark: nowMs < hitmarkUntil, muted: sfx.muted, locked: locked(), leader: leader >= 0 ? w.chickens[leader].name : '',
        }
        api.ui(ui)
      }

      // overlays
      dmgAlpha = Math.max(0, dmgAlpha - dt * 1.8)
      dmg.style.opacity = String(dmgAlpha)
      low.style.opacity = me.alive && me.hp <= 2 ? String(0.35 + Math.sin(tt * 6) * 0.15) : '0'
      cross.style.display = locked() && me.alive ? '' : 'none'
      lockBtn.style.display = locked() || !me.alive ? 'none' : ''

      composer.render(dt)
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
      document.removeEventListener('pointerlockchange', plc)
      if (locked()) document.exitPointerLock()
      cross.remove()
      lockBtn.remove()
      mini.remove()
      aimDots.forEach(d => d.material.dispose())
      dmg.remove()
      low.remove()
      fx.dispose()
      env.dispose()
      labels.dispose()
      glowTex.dispose()
      scene.traverse(o => {
        const m = o as THREE.Mesh
        if (m.geometry && !(o instanceof THREE.Sprite)) m.geometry.dispose()
        const mat = m.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach(x => x.dispose())
        else mat?.dispose()
      })
      composer.dispose()
      target.dispose()
      sfx.dispose()
      renderer.dispose()
      dom.remove()
    }
  },
}

const Chicken = () => <NetShell adapter={adapter} />

export default Chicken
