// Look and animation of Chicken Royale: toon-shaded chickens with a proper walk cycle, blinking, wing and beak
// animation, a sky dome with clouds, animated water with foam, a textured island with swaying grass and props that
// fall into the sea as the island shrinks, plus feathers, smoke, splashes, shockwaves and egg splats.
// Pure presentation: every number that matters (positions, hp, hits) comes from the server snapshots.
import * as THREE from 'three'

const SRGB = THREE.SRGBColorSpace
const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)]
const shortest = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from))

// ---------------------------------------------------------------- textures & materials
const canvasTex = (size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, tile = false) => {
  const c = document.createElement('canvas')
  c.width = c.height = size
  draw(c.getContext('2d')!, size)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = SRGB
  t.anisotropy = 4
  if (tile) t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

// draws a shape at (x, y) and again at the wrapped positions so the texture tiles seamlessly
const wrapped = (s: number, x: number, y: number, r: number, fn: (x: number, y: number) => void) => {
  for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) {
    const px = x + dx, py = y + dy
    if (px > -r && px < s + r && py > -r && py < s + r) fn(px, py)
  }
}

const grassTexture = () => canvasTex(512, (g, s) => {
  g.fillStyle = '#58c264'
  g.fillRect(0, 0, s, s)
  for (let i = 0; i < 260; i++) {
    const x = rand(0, s), y = rand(0, s), r = rand(14, 46)
    const light = Math.random() < 0.5
    wrapped(s, x, y, r, (px, py) => {
      const grad = g.createRadialGradient(px, py, 0, px, py, r)
      grad.addColorStop(0, light ? 'rgba(140,230,120,0.30)' : 'rgba(30,120,60,0.28)')
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = grad
      g.fillRect(px - r, py - r, r * 2, r * 2)
    })
  }
  g.lineCap = 'round'
  for (let i = 0; i < 1400; i++) {
    const x = rand(0, s), y = rand(0, s), len = rand(5, 11)
    g.strokeStyle = Math.random() < 0.5 ? 'rgba(170,240,130,0.45)' : 'rgba(30,110,50,0.4)'
    g.lineWidth = rand(1, 2)
    wrapped(s, x, y, len, (px, py) => { g.beginPath(); g.moveTo(px, py); g.lineTo(px + rand(-2, 2), py - len); g.stroke() })
  }
}, true)

const rockTexture = () => canvasTex(256, (g, s) => {
  g.fillStyle = '#8a6847'
  g.fillRect(0, 0, s, s)
  for (let y = 0; y < s; y += 18) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '50,30,15' : '200,160,110'},${rand(0.08, 0.2)})`
    g.fillRect(0, y + rand(-3, 3), s, rand(6, 14))
  }
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '40,25,10' : '220,190,150'},${rand(0.05, 0.18)})`
    g.fillRect(rand(0, s), rand(0, s), rand(2, 7), rand(6, 22))
  }
}, true)

const glowTexture = () => canvasTex(128, (g, s) => {
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, s, s)
})

const starTexture = () => canvasTex(128, (g, s) => {
  g.translate(s / 2, s / 2)
  g.fillStyle = '#fff'
  for (let i = 0; i < 4; i++) {
    g.rotate(Math.PI / 2)
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(6, -14, 0, -s / 2 + 4); g.quadraticCurveTo(-6, -14, 0, 0); g.fill()
  }
})

const splatTexture = () => canvasTex(128, (g, s) => {
  g.translate(s / 2, s / 2)
  g.fillStyle = 'rgba(255,255,245,0.95)'
  g.beginPath()
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2
    const r = s * 0.22 + Math.sin(a * 5 + 1) * 8 + Math.sin(a * 3) * 6 + (i % 2 ? 6 : 0)
    g[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * r, Math.sin(a) * r)
  }
  g.fill()
  g.fillStyle = '#ffc83a'
  g.beginPath(); g.arc(0, 0, s * 0.11, 0, Math.PI * 2); g.fill()
})

// three tone steps give the chickens a clean cartoon shading
const toonGradient = (() => {
  const t = new THREE.DataTexture(new Uint8Array([85, 150, 215, 255]), 4, 1, THREE.RedFormat)
  t.minFilter = t.magFilter = THREE.NearestFilter
  t.needsUpdate = true
  return t
})()
const toon = (color: THREE.ColorRepresentation, extra: THREE.MeshToonMaterialParameters = {}) =>
  new THREE.MeshToonMaterial({ color, gradientMap: toonGradient, ...extra })

const outlineMat = new THREE.MeshBasicMaterial({ color: 0x3a2412, side: THREE.BackSide })
const outline = (mesh: THREE.Mesh, grow = 1.07) => {
  const o = new THREE.Mesh(mesh.geometry, outlineMat)
  o.scale.setScalar(grow)
  mesh.add(o)
  return o
}

// ---------------------------------------------------------------- labels (names, hearts)
export class Labels {
  private cache = new Map<string, THREE.CanvasTexture>()

  private tex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
    let t = this.cache.get(key)
    if (!t) {
      const c = document.createElement('canvas')
      c.width = w; c.height = h
      draw(c.getContext('2d')!)
      t = new THREE.CanvasTexture(c)
      t.colorSpace = SRGB
      this.cache.set(key, t)
    }
    return t
  }

  text(text: string, color: string, scale: number) {
    const map = this.tex(`t:${text}:${color}`, 256, 64, g => {
      g.font = '800 38px Manrope, sans-serif'
      g.textAlign = 'center'; g.textBaseline = 'middle'
      g.lineWidth = 9; g.strokeStyle = 'rgba(20,10,5,0.8)'; g.lineJoin = 'round'
      g.strokeText(text, 128, 34)
      g.fillStyle = color
      g.fillText(text, 128, 34)
    })
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthTest: false }))
    s.scale.set(scale * 4, scale, 1)
    s.renderOrder = 10
    return s
  }

  hearts(hp: number, max: number) {
    const map = this.tex(`h:${hp}:${max}`, 256, 48, g => {
      g.font = '800 34px Manrope, sans-serif'
      g.textAlign = 'center'; g.textBaseline = 'middle'
      const step = 34
      const start = 128 - ((max - 1) * step) / 2
      for (let i = 0; i < max; i++) {
        g.fillStyle = i < hp ? '#ff4d5e' : 'rgba(255,255,255,0.28)'
        g.strokeStyle = 'rgba(30,10,10,0.8)'; g.lineWidth = 6
        g.strokeText('♥', start + i * step, 26)
        g.fillText('♥', start + i * step, 26)
      }
    })
    return map
  }

  dispose() { this.cache.forEach(t => t.dispose()); this.cache.clear() }
}

// ---------------------------------------------------------------- environment
export type Environment = {
  update: (t: number, dt: number, R: number, camera: THREE.Vector3) => void
  dispose: () => void
  sun: THREE.DirectionalLight
}

type Prop = { obj: THREE.Object3D; r: number; fall: number; spin: number }

export const createEnvironment = (scene: THREE.Scene, rStart: number): Environment => {
  const disposables: { dispose: () => void }[] = []
  const track = <T extends { dispose: () => void }>(d: T) => { disposables.push(d); return d }
  const time = { value: 0 }

  // ---- sky dome with a warm sun
  const sunDir = new THREE.Vector3(0.5, 0.62, 0.35).normalize()
  const sky = new THREE.Mesh(
    track(new THREE.SphereGeometry(320, 32, 16)),
    track(new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x2f8fe8) }, uMid: { value: new THREE.Color(0x7cc4ff) }, uBottom: { value: new THREE.Color(0xdff2ff) },
        uSun: { value: sunDir },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBottom; uniform vec3 uSun; varying vec3 vP;
        void main(){
          vec3 d = normalize(vP);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 c = mix(uBottom, uMid, smoothstep(0.0, 0.28, h));
          c = mix(c, uTop, smoothstep(0.22, 0.85, h));
          float s = max(dot(d, uSun), 0.0);
          c += vec3(1.0, 0.86, 0.55) * (pow(s, 280.0) * 2.0 + pow(s, 14.0) * 0.28);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })),
  )
  sky.renderOrder = -10
  scene.add(sky)
  scene.fog = new THREE.Fog(0xcfe9ff, 70, 230)

  // ---- lights
  const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x5f8a4a, 1.05)
  const sun = new THREE.DirectionalLight(0xfff0d2, 2.4)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.03
  Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 90 })
  const rim = new THREE.DirectionalLight(0x9ec8ff, 0.7)
  rim.position.set(-14, 9, -12)
  scene.add(hemi, sun, sun.target, rim)

  // ---- clouds
  const cloudMat = track(new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 0.96 }))
  const cloudGeo = track(new THREE.SphereGeometry(1, 12, 8))
  const clouds: { g: THREE.Group; ang: number; speed: number; r: number }[] = []
  for (let i = 0; i < 14; i++) {
    const g = new THREE.Group()
    const puffs = 4 + Math.floor(Math.random() * 3)
    for (let j = 0; j < puffs; j++) {
      const m = new THREE.Mesh(cloudGeo, cloudMat)
      m.position.set((j - puffs / 2) * rand(3, 4.5), rand(-0.6, 1.2), rand(-2, 2))
      m.scale.set(rand(3.5, 6), rand(2.2, 3.6), rand(3, 5))
      g.add(m)
    }
    const ang = rand(0, Math.PI * 2), r = rand(110, 190)
    g.position.set(Math.cos(ang) * r, rand(34, 62), Math.sin(ang) * r)
    scene.add(g)
    clouds.push({ g, ang, speed: rand(0.004, 0.012), r })
  }

  // ---- water with caustic lines and a foam ring that follows the island
  const water = new THREE.Mesh(
    track(new THREE.CircleGeometry(400, 64)),
    track(new THREE.ShaderMaterial({
      uniforms: {
        uTime: time, uR: { value: rStart }, uCam: { value: new THREE.Vector3() },
        uDeep: { value: new THREE.Color(0x1658b8) }, uShallow: { value: new THREE.Color(0x35c9d8) }, uFog: { value: new THREE.Color(0xcfe9ff) },
      },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `
        uniform float uTime; uniform float uR; uniform vec3 uCam; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uFog; varying vec3 vW;
        float wave(vec2 p, float t){ return sin(p.x*0.9 + t*1.1) * sin(p.y*0.8 - t*0.9) + sin((p.x+p.y)*0.45 + t*0.6)*0.5; }
        void main(){
          float d = length(vW.xz);
          vec3 col = mix(uDeep, uShallow, smoothstep(uR + 14.0, uR, d));
          float w1 = wave(vW.xz, uTime) * 0.5 + 0.5;
          col += smoothstep(0.8, 0.96, w1) * 0.14 * (1.0 - smoothstep(8.0, 55.0, length(vW.xz - uCam.xz)));   // fades out with distance (no shimmer)
          float foam = smoothstep(uR + 2.2, uR + 0.3, d) * (0.55 + 0.45 * sin(d * 4.0 - uTime * 2.2)) * smoothstep(uR - 0.4, uR + 0.3, d);
          col = mix(col, vec3(1.0), clamp(foam, 0.0, 1.0) * 0.8);
          col = mix(col, uFog, smoothstep(60.0, 230.0, length(vW.xz - uCam.xz)));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })),
  )
  water.rotation.x = -Math.PI / 2
  water.position.y = -1.6
  scene.add(water)

  // ---- island: grass top, rocky sides, lip, glowing danger wall at the edge
  const grassTex = track(grassTexture())
  const island = new THREE.Group()
  const top = new THREE.Mesh(track(new THREE.CircleGeometry(1, 72)), track(new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.95 })))
  top.rotation.x = -Math.PI / 2
  top.receiveShadow = true
  const rockTex = track(rockTexture())
  rockTex.repeat.set(10, 1)
  const side = new THREE.Mesh(track(new THREE.CylinderGeometry(1, 0.72, 4.4, 72, 1, true)), track(new THREE.MeshStandardMaterial({ map: rockTex, roughness: 1, side: THREE.DoubleSide })))
  side.position.y = -2.2
  side.receiveShadow = true
  const lip = new THREE.Mesh(track(new THREE.TorusGeometry(1, 0.06, 8, 96)), track(new THREE.MeshStandardMaterial({ color: 0x7fe07a, roughness: 0.9 })))
  lip.rotation.x = Math.PI / 2
  lip.position.y = -0.02
  island.add(top, side, lip)
  scene.add(island)

  const wall = new THREE.Mesh(
    track(new THREE.CylinderGeometry(1, 1, 3, 96, 1, true)),
    track(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uTime: time },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform float uTime; varying vec2 vUv;
        void main(){
          float a = pow(1.0 - vUv.y, 2.2) * (0.55 + 0.45 * sin(uTime * 3.0 + vUv.x * 80.0));
          gl_FragColor = vec4(1.0, 0.25, 0.22, a * 0.55);
        }`,
    })),
  )
  wall.position.y = 1.5
  scene.add(wall)

  // ---- props near the rim: they drop into the sea when the island shrinks past them
  const props: Prop[] = []
  const trunkMat = track(toon(0x8b5a2b)), leafMats = [track(toon(0x3fb24a)), track(toon(0x2f9a45)), track(toon(0x57c75a))]
  const rockMat = track(toon(0x9aa3ae))
  const bushMat = track(toon(0x4cc153))
  const addProp = (obj: THREE.Object3D, r: number) => { scene.add(obj); props.push({ obj, r, fall: 0, spin: rand(-1, 1) }) }
  for (let i = 0; i < 34; i++) {
    const a = rand(0, Math.PI * 2), r = rStart - rand(0.6, 3.4)
    const kind = Math.random()
    const g = new THREE.Group()
    if (kind < 0.45) {   // tree
      const h = rand(1.4, 2.4)
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, h, 8), trunkMat)
      trunk.position.y = h / 2; trunk.castShadow = true
      g.add(trunk)
      for (let k = 0; k < 3; k++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(1.05 - k * 0.25, 1.15, 9), pick(leafMats))
        cone.position.y = h + 0.25 + k * 0.62
        cone.castShadow = true
        g.add(cone)
      }
      track(trunk.geometry)
    } else if (kind < 0.7) {   // rock
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.4, 0.9), 0), rockMat)
      m.position.y = 0.3; m.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3)); m.scale.y = rand(0.6, 0.9); m.castShadow = true
      g.add(m); track(m.geometry)
    } else if (kind < 0.9) {   // bush
      for (let k = 0; k < 3; k++) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.35, 0.55), 1), bushMat)
        m.position.set(rand(-0.4, 0.4), 0.35, rand(-0.4, 0.4)); m.castShadow = true
        g.add(m); track(m.geometry)
      }
    } else {   // hay bale
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.8, 14), track(toon(0xe6c35a)))
      m.rotation.z = Math.PI / 2; m.position.y = 0.5; m.castShadow = true
      g.add(m); track(m.geometry)
    }
    g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r)
    g.rotation.y = rand(0, 6.28)
    addProp(g, r)
  }

  // ---- swaying grass tufts and flowers (instanced); hidden once the island has shrunk past them
  const TUFTS = 1100
  const tuftGeo = track(new THREE.ConeGeometry(0.045, 0.3, 3))
  tuftGeo.translate(0, 0.15, 0)
  const tuftMat = track(new THREE.MeshLambertMaterial({ color: 0x59cf62 }))
  tuftMat.onBeforeCompile = shader => {
    shader.uniforms.uTime = time
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform float uTime;\nvoid main() {')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float sway = sin(uTime * 2.2 + instanceMatrix[3].x * 0.9 + instanceMatrix[3].z * 0.7) * 0.2 * position.y;
        transformed.x += sway; transformed.z += sway * 0.6;`)
  }
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, TUFTS)
  const flowerGeo = track(new THREE.IcosahedronGeometry(0.1, 0))
  const FLOWERS = 90
  const flowers = new THREE.InstancedMesh(flowerGeo, track(new THREE.MeshLambertMaterial({ color: 0xffffff })), FLOWERS)
  const palette = [0xff7aa8, 0xffd23f, 0xffffff, 0xb583ff].map(c => new THREE.Color(c))
  type Spot = { x: number; z: number; r: number; s: number; rot: number }
  const spot = (maxR: number): Spot => {
    const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * maxR
    return { x: Math.cos(a) * r, z: Math.sin(a) * r, r, s: rand(0.7, 1.35), rot: rand(0, 6.28) }
  }
  const tuftSpots = Array.from({ length: TUFTS }, () => spot(rStart - 0.4))
  const flowerSpots = Array.from({ length: FLOWERS }, () => spot(rStart - 0.8))
  tuftSpots.forEach((_, i) => tufts.setColorAt(i, new THREE.Color().setHSL(rand(0.28, 0.38), 0.55, rand(0.38, 0.56))))
  flowerSpots.forEach((_, i) => flowers.setColorAt(i, pick(palette)))
  tufts.castShadow = false
  scene.add(tufts, flowers)
  const dummy = new THREE.Object3D()
  let shownR = -1
  const refreshScatter = (R: number) => {
    tuftSpots.forEach((s, i) => {
      dummy.position.set(s.x, 0, s.z); dummy.rotation.set(0, s.rot, 0)
      dummy.scale.setScalar(s.r < R - 0.5 ? s.s : 0)
      dummy.updateMatrix(); tufts.setMatrixAt(i, dummy.matrix)
    })
    flowerSpots.forEach((s, i) => {
      dummy.position.set(s.x, 0.22, s.z); dummy.rotation.set(0, s.rot, 0)
      dummy.scale.setScalar(s.r < R - 0.5 ? s.s : 0)
      dummy.updateMatrix(); flowers.setMatrixAt(i, dummy.matrix)
    })
    tufts.instanceMatrix.needsUpdate = true
    flowers.instanceMatrix.needsUpdate = true
    if (tufts.instanceColor) tufts.instanceColor.needsUpdate = true
    if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true
  }

  const update = (t: number, dt: number, R: number, camera: THREE.Vector3) => {
    time.value = t
    ;(water.material as THREE.ShaderMaterial).uniforms.uR.value = R
    ;(water.material as THREE.ShaderMaterial).uniforms.uCam.value.copy(camera)

    island.scale.set(R, 1, R)
    wall.scale.set(R, 1, R)
    grassTex.repeat.set(R / 5, R / 5)
    grassTex.offset.set(0.5 - R / 10, 0.5 - R / 10)
    lip.scale.set(R, R, 1)

    for (const c of clouds) {
      c.ang += c.speed * dt
      c.g.position.x = Math.cos(c.ang) * c.r
      c.g.position.z = Math.sin(c.ang) * c.r
    }

    for (const p of props) {
      if (p.fall === 0 && p.r > R - 0.2) p.fall = 0.0001
      if (p.fall > 0) {   // topple into the water
        p.fall += dt
        p.obj.position.y -= (1 + p.fall * 7) * dt
        p.obj.rotation.z += p.spin * dt * 1.4
        p.obj.visible = p.obj.position.y > -5
      }
    }

    if (Math.abs(R - shownR) > 0.12 || shownR < 0) { shownR = R; refreshScatter(R) }
  }

  const dispose = () => {
    disposables.forEach(d => d.dispose())
    tufts.dispose(); flowers.dispose()
  }
  return { update, dispose, sun }
}

// ---------------------------------------------------------------- chickens
export type Rig = {
  root: THREE.Group; lean: THREE.Group; head: THREE.Group; beakTop: THREE.Mesh; beakBottom: THREE.Mesh
  lidL: THREE.Mesh; lidR: THREE.Mesh; wingL: THREE.Group; wingR: THREE.Group; tail: THREE.Group
  legL: THREE.Group; legR: THREE.Group; scarfTail: THREE.Mesh; comb: THREE.Group
  flashMats: THREE.MeshToonMaterial[]; ring: THREE.Mesh; blob: THREE.Mesh
  name: THREE.Sprite; hearts: THREE.Sprite; glow: THREE.Sprite; marker: THREE.Mesh | null; crown: THREE.Group
  yaw: number; phase: number; hitT: number; throwT: number; spawnT: number; nextBlink: number; blinkT: number
  prevHp: number; heartsHp: number; prevX: number; prevZ: number; speed: number; wasAlive: boolean
}

export type RigHelpers = { labels: Labels; glowTex: THREE.Texture; maxHp: number }

export const buildChicken = (
  scene: THREE.Scene,
  c: { name: string; hue: number; human: boolean; angle: number },
  index: number,
  h: RigHelpers,
  colors: { accent: string; white: string; yellow: string },
): Rig => {
  const flashMats: THREE.MeshToonMaterial[] = []
  const mat = (color: THREE.ColorRepresentation) => { const m = toon(color, { emissive: 0x000000 }); flashMats.push(m); return m }
  const white = mat(0xfff7ea), cream = mat(0xffe9c4), orange = mat(0xff9a1f), red = mat(0xe8384a)
  const scarfMat = mat(new THREE.Color().setHSL(c.hue / 360, 0.78, 0.52))
  const eyeWhite = toon(0xffffff), pupil = toon(0x1a1210), cheek = toon(0xffa0b0)

  const root = new THREE.Group()
  const lean = new THREE.Group()
  lean.position.y = 0.62
  root.add(lean)

  const part = (geo: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number, scale: [number, number, number] = [1, 1, 1], shadow = true) => {
    const m = new THREE.Mesh(geo, material)
    m.position.set(x, y, z)
    m.scale.set(...scale)
    m.castShadow = shadow
    parent.add(m)
    return m
  }

  const body = part(new THREE.SphereGeometry(0.55, 28, 20), white, lean, 0, 0.12, 0, [1, 0.94, 1.2])
  outline(body, 1.05)
  part(new THREE.SphereGeometry(0.4, 18, 14), cream, lean, 0, 0.0, 0.22, [0.95, 0.8, 0.8], false)   // belly

  const head = new THREE.Group()
  head.position.set(0, 0.86, 0.38)
  lean.add(head)
  const skull = part(new THREE.SphereGeometry(0.33, 22, 16), white, head, 0, 0, 0)
  outline(skull, 1.06)
  const beakTop = part(new THREE.ConeGeometry(0.115, 0.28, 12), orange, head, 0, -0.03, 0.4, [1, 1, 0.8])
  beakTop.rotation.x = Math.PI / 2
  const beakBottom = part(new THREE.ConeGeometry(0.085, 0.2, 10), orange, head, 0, -0.1, 0.34, [1, 1, 0.7])
  beakBottom.rotation.x = Math.PI / 2 + 0.1
  part(new THREE.SphereGeometry(0.075, 10, 8), red, head, 0, -0.2, 0.3, [0.8, 1.4, 0.7], false)   // wattle

  const comb = new THREE.Group()
  head.add(comb)
  part(new THREE.SphereGeometry(0.1, 10, 8), red, comb, 0, 0.34, 0.04, [0.8, 1.35, 1.5])
  part(new THREE.SphereGeometry(0.085, 10, 8), red, comb, 0, 0.3, 0.2, [0.7, 1.1, 0.9])
  part(new THREE.SphereGeometry(0.08, 10, 8), red, comb, 0, 0.28, -0.12, [0.7, 1.1, 0.9])

  const eye = (x: number) => {
    part(new THREE.SphereGeometry(0.095, 14, 10), eyeWhite, head, x, 0.08, 0.26, [1, 1.1, 0.7], false)
    part(new THREE.SphereGeometry(0.052, 10, 8), pupil, head, x * 0.92, 0.075, 0.31, [1, 1.1, 0.7], false)
    const lid = part(new THREE.SphereGeometry(0.105, 14, 10), white, head, x, 0.08, 0.265, [1, 0.01, 0.8], false)   // closes to blink
    return lid
  }
  const lidL = eye(-0.15)
  const lidR = eye(0.15)
  part(new THREE.SphereGeometry(0.06, 8, 8), cheek, head, -0.22, -0.04, 0.2, [1, 0.7, 0.5], false)
  part(new THREE.SphereGeometry(0.06, 8, 8), cheek, head, 0.22, -0.04, 0.2, [1, 0.7, 0.5], false)

  const wing = (side: number) => {
    const g = new THREE.Group()
    g.position.set(side * 0.5, 0.26, 0.02)
    lean.add(g)
    const m = part(new THREE.SphereGeometry(0.3, 14, 10), white, g, side * 0.07, -0.2, -0.04, [0.3, 0.8, 0.95])
    outline(m, 1.08)
    return g
  }
  const wingL = wing(-1)
  const wingR = wing(1)

  const tail = new THREE.Group()
  tail.position.set(0, 0.3, -0.62)
  lean.add(tail)
  for (const [rot, col] of [[-0.55, white], [0, cream], [0.55, white]] as [number, THREE.Material][]) {
    const f = part(new THREE.SphereGeometry(0.2, 10, 8), col, tail, Math.sin(rot) * 0.18, 0.2 + Math.cos(rot) * 0.1, -0.08, [0.28, 1.5, 0.5])
    f.rotation.z = rot
    f.rotation.x = -0.45
  }

  const leg = (x: number) => {
    const g = new THREE.Group()
    g.position.set(x, -0.04, 0.02)
    lean.add(g)
    part(new THREE.CylinderGeometry(0.05, 0.045, 0.55, 8), orange, g, 0, -0.27, 0, [1, 1, 1], true)
    part(new THREE.BoxGeometry(0.2, 0.06, 0.26), orange, g, 0, -0.56, 0.07, [1, 1, 1], true)
    return g
  }
  const legL = leg(-0.2)
  const legR = leg(0.2)

  // a little personality: every chicken wears something different
  const dark = toon(0x1b1b22), hatMat = mat(new THREE.Color().setHSL(((c.hue + 180) % 360) / 360, 0.7, 0.5)), gold = toon(0xffd23f, { emissive: 0xc88a00 })
  switch (index % 6) {
    case 0: {   // sunglasses
      part(new THREE.BoxGeometry(0.15, 0.1, 0.05), dark, head, -0.15, 0.1, 0.33, [1, 1, 1], false)
      part(new THREE.BoxGeometry(0.15, 0.1, 0.05), dark, head, 0.15, 0.1, 0.33, [1, 1, 1], false)
      part(new THREE.BoxGeometry(0.1, 0.03, 0.04), dark, head, 0, 0.12, 0.34, [1, 1, 1], false)
      break
    }
    case 1: {   // baseball cap
      part(new THREE.SphereGeometry(0.34, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), hatMat, head, 0, 0.12, 0.0, [1, 0.9, 1])
      part(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 16, 1, false, 0, Math.PI), hatMat, head, 0, 0.14, 0.34, [1.1, 1, 1.2])
      break
    }
    case 2: {   // headband
      const band = part(new THREE.TorusGeometry(0.325, 0.045, 8, 22), hatMat, head, 0, 0.12, 0, [1, 1, 1], false)
      band.rotation.x = Math.PI / 2
      break
    }
    case 3: {   // bow tie
      const l = part(new THREE.ConeGeometry(0.11, 0.2, 10), hatMat, lean, -0.13, 0.62, 0.52, [1, 1, 0.5], false)
      l.rotation.z = Math.PI / 2
      const r = part(new THREE.ConeGeometry(0.11, 0.2, 10), hatMat, lean, 0.13, 0.62, 0.52, [1, 1, 0.5], false)
      r.rotation.z = -Math.PI / 2
      part(new THREE.SphereGeometry(0.06, 8, 8), hatMat, lean, 0, 0.62, 0.52, [1, 1, 1], false)
      break
    }
    case 4: {   // top hat
      part(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 18), dark, head, 0, 0.3, 0.02)
      part(new THREE.CylinderGeometry(0.17, 0.17, 0.32, 18), dark, head, 0, 0.46, 0.02)
      part(new THREE.CylinderGeometry(0.175, 0.175, 0.07, 18), hatMat, head, 0, 0.36, 0.02, [1, 1, 1], false)
      break
    }
    default: {   // goggles
      for (const x of [-0.14, 0.14]) {
        const lens = part(new THREE.TorusGeometry(0.075, 0.025, 8, 14), hatMat, head, x, 0.1, 0.32, [1, 1, 1], false)
        lens.rotation.y = 0
      }
      const strap = part(new THREE.TorusGeometry(0.33, 0.02, 6, 20), dark, head, 0, 0.1, 0.0, [1, 1, 1], false)
      strap.rotation.x = Math.PI / 2
    }
  }

  const crown = new THREE.Group()
  crown.position.set(0, 0.42, 0.02)
  crown.visible = false
  head.add(crown)
  part(new THREE.CylinderGeometry(0.2, 0.17, 0.12, 10), gold, crown, 0, 0, 0, [1, 1, 1], false)
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2
    part(new THREE.ConeGeometry(0.05, 0.14, 6), gold, crown, Math.cos(a) * 0.18, 0.12, Math.sin(a) * 0.18, [1, 1, 1], false)
  }

  const scarf = part(new THREE.TorusGeometry(0.34, 0.085, 10, 22), scarfMat, lean, 0, 0.78, 0.36)
  scarf.rotation.x = Math.PI / 2 - 0.35
  const scarfTail = part(new THREE.BoxGeometry(0.14, 0.34, 0.05), scarfMat, lean, 0.2, 0.62, 0.12, [1, 1, 1], false)
  scarfTail.geometry.translate(0, -0.15, 0)

  // ground ring in the player's colour, soft contact shadow
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(c.human ? 0.95 : 0.8, c.human ? 1.12 : 0.9, 40),
    new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(c.hue / 360, 0.85, 0.6), transparent: true, opacity: c.human ? 0.85 : 0.5, side: THREE.DoubleSide, depthWrite: false }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.04
  root.add(ring)
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2, depthWrite: false }))
  blob.rotation.x = -Math.PI / 2
  blob.position.y = 0.03
  root.add(blob)

  const name = h.labels.text(c.name, c.human ? colors.accent : colors.white, 0.42)
  name.position.y = 2.7
  root.add(name)
  const hearts = new THREE.Sprite(new THREE.SpriteMaterial({ map: h.labels.hearts(h.maxHp, h.maxHp), transparent: true, depthTest: false }))
  hearts.scale.set(1.5, 0.28, 1)
  hearts.position.y = 2.38
  hearts.renderOrder = 10
  root.add(hearts)

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: h.glowTex, color: 0xffd23f, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }))
  glow.scale.set(3.4, 3.4, 1)
  glow.position.y = 0.95
  root.add(glow)

  let marker: THREE.Mesh | null = null
  if (c.human) {
    marker = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.38, 4), new THREE.MeshBasicMaterial({ color: colors.yellow }))
    marker.rotation.x = Math.PI
    marker.position.y = 3.1
    root.add(marker)
  }

  scene.add(root)
  return {
    root, lean, head, beakTop, beakBottom, lidL, lidR, wingL, wingR, tail, legL, legR, scarfTail, comb,
    flashMats, ring, blob, name, hearts, glow, marker, crown,
    yaw: c.angle, phase: index * 1.7, hitT: 0, throwT: 0, spawnT: 0, nextBlink: 1 + Math.random() * 3, blinkT: 0,
    prevHp: h.maxHp, heartsHp: h.maxHp, prevX: 0, prevZ: 0, speed: 0, wasAlive: true,
  }
}

type Pose = { x: number; z: number; angle: number; moveX: number; moveZ: number; hp: number; gold: number; alive: boolean; falling: number }

export const animateChicken = (rig: Rig, c: Pose, index: number, t: number, dt: number, h: RigHelpers) => {
  rig.root.visible = c.alive
  if (!c.alive) { rig.wasAlive = false; return }
  if (!rig.wasAlive) { rig.wasAlive = true; rig.spawnT = 0 }

  // measured speed (includes knock-back), smoothed so the walk cycle does not stutter
  const dx = c.x - rig.prevX, dz = c.z - rig.prevZ
  rig.prevX = c.x; rig.prevZ = c.z
  const measured = Math.min(10, Math.hypot(dx, dz) / Math.max(dt, 1e-4))
  rig.speed += (measured - rig.speed) * Math.min(1, dt * 10)
  const move = Math.min(1, rig.speed / 5.5)

  // heading follows the aim direction smoothly
  rig.yaw += shortest(rig.yaw, c.angle) * Math.min(1, dt * 16)
  rig.root.position.set(c.x, 0, c.z)
  rig.root.rotation.y = Math.PI / 2 - rig.yaw

  rig.spawnT = Math.min(1, rig.spawnT + dt * 2.2)
  const pop = rig.spawnT < 1 ? 1 + Math.sin(rig.spawnT * Math.PI) * 0.18 - (1 - rig.spawnT) * 0.9 : 1

  rig.hitT = Math.max(0, rig.hitT - dt * 3.2)
  rig.throwT = Math.max(0, rig.throwT - dt * 3.6)
  rig.phase += dt * (3 + rig.speed * 1.9)

  const falling = c.falling > 0
  const swing = Math.sin(rig.phase) * 0.95 * move
  rig.legL.rotation.x = swing
  rig.legR.rotation.x = -swing
  const bob = Math.abs(Math.sin(rig.phase)) * 0.09 * move + Math.sin(t * 2.4 + index) * 0.012
  const throwK = Math.sin(rig.throwT * Math.PI)                 // 0 → 1 → 0 across the throw
  const hitK = rig.hitT

  rig.lean.position.y = 0.62 + bob
  rig.lean.rotation.x = move * 0.13 + throwK * 0.22 - hitK * 0.18
  rig.lean.rotation.z = Math.sin(rig.phase) * 0.05 * move
  const squash = 1 - hitK * 0.16 + throwK * 0.06                // < 1 squashes the body down and out
  const wide = pop * (1 + (1 - squash) * 0.7)
  rig.lean.scale.set(wide, pop * squash, wide)

  // head bobs like a real chicken while walking and snaps forward when throwing
  rig.head.position.z = 0.38 + Math.sin(rig.phase * 2) * 0.05 * move + throwK * 0.14
  rig.head.position.y = 0.86 + Math.sin(rig.phase * 2 + 1) * 0.02 * move
  rig.head.rotation.x = Math.sin(t * 1.3 + index) * 0.04 + throwK * 0.25 + hitK * 0.3
  rig.head.rotation.y = Math.sin(t * 0.7 + index * 2) * 0.12 * (1 - move)
  const open = Math.max(throwK, falling ? 0.6 + Math.sin(t * 30) * 0.4 : 0, hitK * 0.8)
  rig.beakBottom.rotation.x = Math.PI / 2 + 0.1 + open * 0.55
  rig.comb.rotation.z = Math.sin(rig.phase * 2) * 0.12 * move + hitK * 0.3

  // blinking
  rig.nextBlink -= dt
  if (rig.nextBlink <= 0) { rig.blinkT = 0.14; rig.nextBlink = 2 + Math.random() * 3.5 }
  rig.blinkT = Math.max(0, rig.blinkT - dt)
  const lid = hitK > 0.3 ? 1 : rig.blinkT > 0 ? Math.sin((rig.blinkT / 0.14) * Math.PI) : 0.01
  rig.lidL.scale.y = lid
  rig.lidR.scale.y = lid

  // wings: tuck while walking, wind up and thrust when throwing, flail when falling
  const flap = falling ? Math.sin(t * 42) * 1.0 : Math.sin(rig.phase * 2) * 0.25 * move
  const windUp = throwK * 0.9
  rig.wingL.rotation.z = 0.25 + flap + windUp + hitK * 0.5
  rig.wingR.rotation.z = -0.25 - flap - windUp - hitK * 0.5
  rig.wingL.rotation.x = -throwK * 0.9
  rig.wingR.rotation.x = -throwK * 0.9

  rig.tail.rotation.y = Math.sin(t * 7 + index) * 0.22 * (0.4 + move)
  rig.tail.rotation.x = -0.1 - move * 0.2
  rig.scarfTail.rotation.z = Math.sin(t * 5 + index) * 0.25 + move * 0.5
  rig.scarfTail.rotation.x = Math.sin(t * 6.5 + index) * 0.15 - move * 0.4

  // falling off the island: tumble and shrink
  if (falling) {
    rig.root.position.y = -c.falling * 8
    rig.root.rotation.z = c.falling * 7
    rig.root.rotation.x = c.falling * 3
    const s = Math.max(0.2, 1 - c.falling * 0.4)
    rig.root.scale.setScalar(s)
  } else {
    rig.root.rotation.z = 0; rig.root.rotation.x = 0
    rig.root.scale.setScalar(1)
  }

  // damage flash (white-red), golden-egg aura
  const flash = Math.max(0, hitK)
  for (const m of rig.flashMats) { m.emissive.setRGB(flash * 0.9, flash * 0.25, flash * 0.2) }
  const goldOn = c.gold > 0 ? 1 : 0
  ;(rig.glow.material as THREE.SpriteMaterial).opacity += (goldOn * (0.55 + Math.sin(t * 6) * 0.15) - (rig.glow.material as THREE.SpriteMaterial).opacity) * Math.min(1, dt * 8)

  rig.ring.scale.setScalar(1 + Math.sin(t * 3 + index) * 0.03 + (rig.marker ? 0.03 * Math.sin(t * 5) : 0))
  rig.blob.scale.setScalar(1 - bob * 1.4)
  if (rig.marker) { rig.marker.position.y = 3.1 + Math.sin(t * 4) * 0.1; rig.marker.rotation.y = t * 2 }

  if (c.hp !== rig.heartsHp) {
    rig.heartsHp = c.hp
    ;(rig.hearts.material as THREE.SpriteMaterial).map = h.labels.hearts(Math.max(0, c.hp), h.maxHp)
    ;(rig.hearts.material as THREE.SpriteMaterial).needsUpdate = true
  }
}

// ---------------------------------------------------------------- particles & decals
type P = {
  obj: THREE.Object3D; vx: number; vy: number; vz: number; life: number; max: number; gravity: number
  kind: 'feather' | 'bit' | 'puff' | 'star' | 'drop' | 'ring' | 'text' | 'ripple'; spin: number; grow: number; seed: number
}

export class Fx {
  private list: P[] = []
  private splats: THREE.Mesh[] = []
  private feather = new THREE.PlaneGeometry(0.22, 0.09)
  private bit = new THREE.BoxGeometry(0.13, 0.13, 0.13)
  private drop = new THREE.SphereGeometry(0.1, 8, 6)
  private ringGeo = new THREE.RingGeometry(0.85, 1, 40)
  private mats = new Map<string, THREE.Material>()
  private glow: THREE.Texture
  private starTex: THREE.Texture
  private splatTex: THREE.Texture
  private scene: THREE.Scene

  constructor(scene: THREE.Scene, glow: THREE.Texture) {
    this.scene = scene
    this.glow = glow
    this.starTex = starTexture()
    this.splatTex = splatTexture()
  }

  private mat(key: string, make: () => THREE.Material) {
    let m = this.mats.get(key)
    if (!m) { m = make(); this.mats.set(key, m) }
    return m
  }

  private spriteMat(tex: THREE.Texture, color: THREE.ColorRepresentation, additive: boolean, opacity = 1) {
    return new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending })
  }

  private add(p: P) { this.scene.add(p.obj); this.list.push(p) }

  feathers(x: number, y: number, z: number, n: number, color: THREE.ColorRepresentation = 0xffffff) {
    const m = this.mat(`f:${color}`, () => new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }))
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(this.feather, m)
      mesh.position.set(x, y, z)
      mesh.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6))
      const a = rand(0, Math.PI * 2), sp = rand(1.5, 4.5)
      this.add({ obj: mesh, vx: Math.cos(a) * sp, vy: rand(2, 5.5), vz: Math.sin(a) * sp, life: rand(1.1, 1.8), max: 1.6, gravity: 4, kind: 'feather', spin: rand(4, 10), grow: 0, seed: rand(0, 6) })
    }
  }

  bits(x: number, y: number, z: number, color: THREE.ColorRepresentation, n: number, power: number) {
    const m = this.mat(`b:${color}`, () => new THREE.MeshToonMaterial({ color, gradientMap: toonGradient }))
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(this.bit, m)
      mesh.position.set(x, y, z)
      mesh.scale.setScalar(rand(0.5, 1.2))
      const a = rand(0, Math.PI * 2), sp = power * rand(0.4, 1.3)
      this.add({ obj: mesh, vx: Math.cos(a) * sp, vy: rand(2.5, 6.5), vz: Math.sin(a) * sp, life: 0.9, max: 0.9, gravity: 15, kind: 'bit', spin: rand(4, 12), grow: 0, seed: 0 })
    }
  }

  puff(x: number, y: number, z: number, color: THREE.ColorRepresentation, size: number, n = 1) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(this.spriteMat(this.glow, color, false, 0.7))
      s.position.set(x + rand(-0.3, 0.3), y + rand(0, 0.3), z + rand(-0.3, 0.3))
      s.scale.setScalar(size * rand(0.7, 1.2))
      this.add({ obj: s, vx: rand(-0.6, 0.6), vy: rand(0.6, 1.6), vz: rand(-0.6, 0.6), life: rand(0.7, 1.1), max: 0.9, gravity: 0, kind: 'puff', spin: 0, grow: size * 1.8, seed: 0 })
    }
  }

  star(x: number, y: number, z: number, color: THREE.ColorRepresentation, size: number) {
    const s = new THREE.Sprite(this.spriteMat(this.starTex, color, true))
    s.position.set(x, y, z)
    s.scale.setScalar(size)
    this.add({ obj: s, vx: 0, vy: 0.4, vz: 0, life: 0.28, max: 0.28, gravity: 0, kind: 'star', spin: 0, grow: size * 1.6, seed: 0 })
  }

  drops(x: number, z: number, n: number) {
    const m = this.mat('drop', () => new THREE.MeshBasicMaterial({ color: 0xbfe9ff }))
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(this.drop, m)
      mesh.position.set(x, -1.4, z)
      mesh.scale.setScalar(rand(0.5, 1.1))
      const a = rand(0, Math.PI * 2), sp = rand(0.8, 3)
      this.add({ obj: mesh, vx: Math.cos(a) * sp, vy: rand(4, 8), vz: Math.sin(a) * sp, life: 1.2, max: 1.2, gravity: 16, kind: 'drop', spin: 0, grow: 0, seed: 0 })
    }
  }

  ripple(x: number, y: number, z: number, color: THREE.ColorRepresentation, size: number, life = 0.8) {
    const mesh = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false }))
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(x, y, z)
    mesh.scale.setScalar(0.3)
    this.add({ obj: mesh, vx: 0, vy: 0, vz: 0, life, max: life, gravity: 0, kind: 'ripple', spin: 0, grow: size, seed: 0 })
  }

  popText(sprite: THREE.Sprite, x: number, y: number, z: number) {
    sprite.position.set(x, y, z)
    sprite.scale.multiplyScalar(0.4)
    this.add({ obj: sprite, vx: 0, vy: 2.4, vz: 0, life: 1, max: 1, gravity: 0, kind: 'text', spin: 0, grow: 1, seed: 0 })
  }

  // yolk splat decal that fades away
  groundSplat(x: number, z: number, gold: boolean) {
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 20),
      new THREE.MeshBasicMaterial({ map: this.splatTex, color: gold ? 0xffd23f : 0xffffff, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    )
    mesh.rotation.set(-Math.PI / 2, 0, rand(0, 6))
    mesh.position.set(x, 0.035, z)
    mesh.scale.setScalar(rand(0.7, 1.1))
    mesh.userData.age = 0
    this.scene.add(mesh)
    this.splats.push(mesh)
    if (this.splats.length > 40) { const old = this.splats.shift()!; this.scene.remove(old); old.geometry.dispose(); (old.material as THREE.Material).dispose() }
  }

  update(dt: number) {
    for (let i = this.splats.length - 1; i >= 0; i--) {
      const s = this.splats[i]
      s.userData.age += dt
      ;(s.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - s.userData.age / 6)
      if (s.userData.age > 6) { this.scene.remove(s); s.geometry.dispose(); (s.material as THREE.Material).dispose(); this.splats.splice(i, 1) }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]
      p.life -= dt
      const k = Math.max(0, p.life / p.max)
      const o = p.obj
      if (p.kind === 'ring' || p.kind === 'ripple') {
        o.scale.setScalar(0.3 + (1 - k) * p.grow)
        ;((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = k * 0.9
      } else if (p.kind === 'puff') {
        o.position.x += p.vx * dt; o.position.y += p.vy * dt; o.position.z += p.vz * dt
        o.scale.addScalar(p.grow * dt)
        ;(o as THREE.Sprite).material.opacity = k * 0.7
      } else if (p.kind === 'star') {
        o.scale.addScalar(p.grow * dt)
        ;(o as THREE.Sprite).material.opacity = k
      } else if (p.kind === 'text') {
        o.position.y += p.vy * dt
        p.vy *= 1 - dt * 2
        const pop = Math.min(1, (1 - k) * 8)
        const sc = o.userData.base ?? (o.userData.base = o.scale.clone())
        o.scale.copy(sc).multiplyScalar(0.6 + pop * 0.4 + (1 - k) * 0.2)
        ;(o as THREE.Sprite).material.opacity = Math.min(1, k * 2.6)
      } else {
        p.vy -= p.gravity * dt
        o.position.x += p.vx * dt; o.position.y += p.vy * dt; o.position.z += p.vz * dt
        if (p.kind === 'feather') {
          p.vx *= 1 - dt * 1.6; p.vz *= 1 - dt * 1.6; p.vy = Math.max(p.vy, -1.6)    // drift down slowly
          o.position.x += Math.sin(p.life * 6 + p.seed) * 0.8 * dt
          o.rotation.x += p.spin * dt; o.rotation.z += p.spin * 0.6 * dt
          if (o.position.y < 0.05) { o.position.y = 0.05; p.vy = 0; p.vx = 0; p.vz = 0; p.spin = 0 }
        } else if (p.kind === 'bit') {
          o.rotation.x += p.spin * dt; o.rotation.y += p.spin * dt
          if (o.position.y < 0.07) { o.position.y = 0.07; p.vy = 0; p.vx *= 0.6; p.vz *= 0.6 }
        }
        o.scale.multiplyScalar(k < 0.25 ? 1 - dt * 3 : 1)
      }
      if (p.life <= 0) {
        this.scene.remove(o)
        if (o instanceof THREE.Sprite) o.material.dispose()
        else if (p.kind === 'ring' || p.kind === 'ripple') ((o as THREE.Mesh).material as THREE.Material).dispose()
        this.list.splice(i, 1)
      }
    }
  }

  dispose() {
    for (const p of this.list) this.scene.remove(p.obj)
    for (const s of this.splats) this.scene.remove(s)
    this.list = []; this.splats = []
    this.mats.forEach(m => m.dispose())
    this.starTex.dispose(); this.splatTex.dispose()
    this.feather.dispose(); this.bit.dispose(); this.drop.dispose(); this.ringGeo.dispose()
  }
}

export const makeGlowTexture = glowTexture
export { toon, outline, shortest }
