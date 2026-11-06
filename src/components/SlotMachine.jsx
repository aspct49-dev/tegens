import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

/*
 * The TGN slot machine (public/models/slot-machine.glb, built in Blender by
 * trophy/slot/build_slot.py). Three reels carry the players' names; a draw pulls
 * the lever, spins the reels and stops them left to right on the winner's name
 * across the payline, then coins burst from the tray. The result always comes
 * from the raffle data; this only shows it.
 */

const MODEL_URL = '/models/slot-machine.glb'
const DRACO_PATH = '/draco/'
const REELS = 3
const CELLS = 12 // cells round each reel
const CELL_PX = 256 // canvas pixels per cell (height)
const REEL_PX = 512 // canvas pixels across a reel
const SPEED = 15 // cells per second at full spin
const OVERSHOOT = 0.9 // easeOutBack overshoot on the stop
const STOP_CELLS = 4.5 // how far a reel travels while it stops

// Draw timeline (seconds from the lever pull)
const T_SPIN = 0.32 // reels start as the lever bottoms out
const T_STOP = [1.9, 2.65, 3.6] // when each reel starts to stop
const T_PULL = 0.9

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
const clamp01 = (t) => Math.min(1, Math.max(0, t))
const backOut = (t) => 1 + (OVERSHOOT + 1) * Math.pow(t - 1, 3) + OVERSHOOT * Math.pow(t - 1, 2)

// ---------------------------------------------------------------- reel art
function drawCell(g, k, cell) {
  const y = k * CELL_PX
  const bg = g.createLinearGradient(0, y, 0, y + CELL_PX)
  bg.addColorStop(0, '#e9eef6')
  bg.addColorStop(0.5, '#ffffff')
  bg.addColorStop(1, '#e9eef6')
  g.fillStyle = bg
  g.fillRect(0, y, REEL_PX, CELL_PX)
  g.fillStyle = '#c3cfdf'
  g.fillRect(0, y, REEL_PX, 3)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const cy = y + CELL_PX / 2
  if (cell.kind === 'tgn') {
    g.font = '900 120px Inter, system-ui, sans-serif'
    const grad = g.createLinearGradient(0, cy - 60, 0, cy + 60)
    grad.addColorStop(0, '#ffe08a')
    grad.addColorStop(1, '#d99a1c')
    g.lineWidth = 14
    g.strokeStyle = '#123a6e'
    g.strokeText('TGN', REEL_PX / 2, cy + 6)
    g.fillStyle = grad
    g.fillText('TGN', REEL_PX / 2, cy + 6)
  } else if (cell.kind === 'seven') {
    g.font = '900 170px Inter, system-ui, sans-serif'
    g.lineWidth = 16
    g.strokeStyle = '#f2b42c'
    g.strokeText('7', REEL_PX / 2, cy + 8)
    g.fillStyle = '#e8333a'
    g.fillText('7', REEL_PX / 2, cy + 8)
  } else {
    // a ticket chip + the masked name
    g.fillStyle = cell.win ? '#f2b42c' : '#1f6fe0'
    g.beginPath()
    g.arc(REEL_PX / 2, cy - 62, 26, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#ffffff'
    g.font = '900 28px Inter, system-ui, sans-serif'
    g.fillText('T', REEL_PX / 2, cy - 60)
    let size = 92
    g.font = `900 ${size}px Inter, system-ui, sans-serif`
    while (g.measureText(cell.label).width > REEL_PX - 36 && size > 36) {
      size -= 4
      g.font = `900 ${size}px Inter, system-ui, sans-serif`
    }
    g.fillStyle = '#0c1a2b'
    g.fillText(cell.label, REEL_PX / 2, cy + 30)
  }
}

function reelStrip(names, seed) {
  // names spread round the reel with TGN and 7 symbols between them
  const pool = names.length ? names : ['TGN']
  const cells = []
  for (let k = 0; k < CELLS; k++) {
    if (k % 4 === seed % 4) cells.push({ kind: k % 8 === seed % 8 ? 'seven' : 'tgn' })
    else cells.push({ kind: 'name', label: pool[(k * 5 + seed * 7) % pool.length] })
  }
  return cells
}

// a curved strip (the front of a reel): angle runs round X, v runs bottom to top
function arcGeometry(r, theta, width, segs = 48) {
  const pos = []
  const nrm = []
  const uv = []
  const idx = []
  for (let i = 0; i <= segs; i++) {
    const a = -theta / 2 + (i / segs) * theta
    const y = r * Math.sin(a)
    const z = r * Math.cos(a) - r
    for (const s of [-1, 1]) {
      pos.push((s * width) / 2, y, z)
      nrm.push(0, Math.sin(a), Math.cos(a))
      uv.push(s < 0 ? 0 : 1, i / segs)
    }
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

// shading over the reels: dark at the top and bottom of the window, clear on the payline
function shadeTexture() {
  const c = document.createElement('canvas')
  c.width = 4
  c.height = 256
  const g = c.getContext('2d')
  const grad = g.createLinearGradient(0, 0, 0, 256)
  grad.addColorStop(0, 'rgba(6,14,24,0.82)')
  grad.addColorStop(0.3, 'rgba(6,14,24,0.12)')
  grad.addColorStop(0.5, 'rgba(6,14,24,0)')
  grad.addColorStop(0.7, 'rgba(6,14,24,0.12)')
  grad.addColorStop(1, 'rgba(6,14,24,0.82)')
  g.fillStyle = grad
  g.fillRect(0, 0, 4, 256)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// the card's backdrop drawn into the scene (the glass and bloom need something behind them)
function backdropTexture() {
  const w = 1024
  const h = 640
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  const base = g.createLinearGradient(0, 0, 0, h)
  base.addColorStop(0, '#10233a')
  base.addColorStop(1, '#0a141c')
  g.fillStyle = base
  g.fillRect(0, 0, w, h)
  const glow = (x, y, rx, ry, rgb, a) => {
    g.save()
    g.translate(x * w, y * h)
    g.scale(rx * w, ry * h)
    const r = g.createRadialGradient(0, 0, 0, 0, 0, 1)
    r.addColorStop(0, `rgba(${rgb},${a})`)
    r.addColorStop(1, `rgba(${rgb},0)`)
    g.fillStyle = r
    g.fillRect(-1, -1, 2, 2)
    g.restore()
  }
  glow(0.5, 0.48, 0.42, 0.62, '31,111,224', 0.38)
  glow(0.5, 0.8, 0.2, 0.18, '242,180,44', 0.12)
  g.fillStyle = 'rgba(77,184,255,0.06)'
  g.fillRect(0, h * 0.86, w, 2)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export default function SlotMachine({ names, draw, resting = null, onDrawn }) {
  const hostRef = useRef(null)
  const [status, setStatus] = useState('loading')
  const [winner, setWinner] = useState(resting ? { key: 'rest', name: resting, shown: true } : null)
  const api = useRef(null)
  const onDrawnRef = useRef(onDrawn)
  onDrawnRef.current = onDrawn
  const seenDraw = useRef(draw?.key ?? null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined
    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    } catch {
      setStatus('unsupported')
      return undefined
    }
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    // supersample on 1x screens: the post-processing chain renders off-screen
    renderer.setPixelRatio(Math.min(Math.max(window.devicePixelRatio, 1.5), 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.95
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    host.appendChild(renderer.domElement)
    const anisotropy = renderer.capabilities.getMaxAnisotropy()

    const scene = new THREE.Scene()
    const backdrop = backdropTexture()
    scene.background = backdrop
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.03).texture
    scene.environment = envTexture
    scene.environmentIntensity = 0.38

    // replaced by the model's bounds on load
    const frameCenter = new THREE.Vector3(0, 1.5, 0)
    const frameSize = new THREE.Vector3(2.2, 3.0, 1.6)
    const look = new THREE.Vector3()
    const key = new THREE.DirectionalLight(0xfff3e2, 1.7)
    key.position.set(2.5, 6, 5)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.bias = -0.0004
    key.shadow.normalBias = 0.02
    key.shadow.radius = 4
    Object.assign(key.shadow.camera, { left: -3, right: 3, top: 4, bottom: -1, near: 1, far: 20 })
    const fill = new THREE.DirectionalLight(0xbcd6ff, 0.45)
    fill.position.set(-5, 3, 4)
    const rim = new THREE.DirectionalLight(0x4db8ff, 2.4)
    rim.position.set(-2, 9, -4.5) // steep: a low rim mirrors off flat gold surfaces into the camera
    const rim2 = new THREE.DirectionalLight(0x6fa8ff, 1.4)
    rim2.position.set(4.5, 8, -3)
    // the rims come from behind: without shadows they mirror off the gold coin tray
    // (tucked under the deck) straight into the camera
    for (const l of [rim, rim2]) {
      l.castShadow = true
      l.shadow.mapSize.set(1024, 1024)
      l.shadow.bias = -0.0006
      l.shadow.normalBias = 0.03
      Object.assign(l.shadow.camera, { left: -3, right: 3, top: 4, bottom: -1, near: 1, far: 20 })
    }
    for (const l of [key, fill, rim, rim2]) scene.add(l, l.target)
    // a soft light on the reels from just above the window
    const reelLight = new THREE.PointLight(0xfff4dc, 1.2, 2.2, 1.5)
    scene.add(reelLight)

    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 60)
    // MSAA target: the canvas's own antialias doesn't apply once bloom renders off-screen
    const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }))
    composer.addPass(new RenderPass(scene, camera))
    const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.35, 0.35, 0.95)
    composer.addPass(bloom)
    composer.addPass(new OutputPass())

    const machine = new THREE.Group()
    scene.add(machine)
    const disposables = [envTexture, pmrem, backdrop]

    let lever = null
    let marquee = null
    const coinSpawn = new THREE.Vector3(0, 0.5, 0.6)

    // ---- reels (built once the window's size is known)
    const reels = []
    let paylineMat = null
    let rep = 0.5
    const repaint = (reel) => {
      reel.cells.forEach((cell, k) => drawCell(reel.g, k, cell))
      reel.gBlur.filter = 'blur(10px)'
      reel.gBlur.clearRect(0, 0, REEL_PX, CELLS * CELL_PX)
      reel.gBlur.drawImage(reel.canvas, 0, 0)
      reel.tex.needsUpdate = true
      reel.blurTex.needsUpdate = true
    }
    const offsetFor = (k) => 1 - (k + 0.5) / CELLS - 0.5 * rep // cell k centred on the payline
    const cellAt = (offset) => {
      const t = (((offset + 0.5 * rep) % 1) + 1) % 1
      return ((Math.round((1 - t) * CELLS - 0.5) % CELLS) + CELLS) % CELLS
    }
    const setOffset = (reel, o) => {
      reel.offset = o
      reel.tex.offset.y = o
      reel.blurTex.offset.y = o
    }
    const buildReels = (A, B) => {
      const w = B.x - A.x
      const h = B.y - A.y
      const gap = w * 0.035
      const rw = (w - gap * (REELS + 1)) / REELS
      const r = h * 0.62
      const theta = 2 * Math.asin(Math.min(0.98, (h / 2 + 0.05) / r))
      const cellWorld = h / 2.0 // the payline cell plus half a cell above and below
      rep = (r * theta) / (CELLS * cellWorld)
      const geo = arcGeometry(r, theta, rw)
      disposables.push(geo)
      const yMid = (A.y + B.y) / 2
      const zFront = A.z - 0.05
      for (let i = 0; i < REELS; i++) {
        const canvas = document.createElement('canvas')
        canvas.width = REEL_PX
        canvas.height = CELLS * CELL_PX
        const blurCanvas = document.createElement('canvas')
        blurCanvas.width = REEL_PX
        blurCanvas.height = CELLS * CELL_PX
        const tex = new THREE.CanvasTexture(canvas)
        const blurTex = new THREE.CanvasTexture(blurCanvas)
        for (const t of [tex, blurTex]) {
          t.colorSpace = THREE.SRGBColorSpace
          t.anisotropy = anisotropy
          t.wrapT = THREE.RepeatWrapping
          t.repeat.set(1, rep)
        }
        const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.42, metalness: 0, envMapIntensity: 0.6 })
        const mesh = new THREE.Mesh(geo, mat)
        mesh.position.set(A.x + gap + rw / 2 + i * (rw + gap), yMid, zFront)
        mesh.receiveShadow = true
        machine.add(mesh)
        const reel = {
          canvas,
          g: canvas.getContext('2d'),
          gBlur: blurCanvas.getContext('2d'),
          tex,
          blurTex,
          mat,
          cells: reelStrip([], i),
          offset: 0,
          speed: 0,
          stop: null,
        }
        repaint(reel)
        setOffset(reel, offsetFor(i * 3))
        reels.push(reel)
        disposables.push(tex, blurTex, mat)
      }
      // dark dividers between the reels and the window's shading
      const divMat = new THREE.MeshStandardMaterial({ color: 0x0a1420, roughness: 0.6 })
      const divGeo = new THREE.BoxGeometry(gap * 0.9, h + 0.1, 0.06)
      disposables.push(divMat, divGeo)
      for (let i = 0; i <= REELS; i++) {
        const d = new THREE.Mesh(divGeo, divMat)
        d.position.set(A.x + gap / 2 + i * (rw + gap), yMid, zFront - 0.02)
        machine.add(d)
      }
      const shadeTex = shadeTexture()
      const shadeMat = new THREE.MeshBasicMaterial({ map: shadeTex, transparent: true, depthWrite: false })
      const shadeGeo = new THREE.PlaneGeometry(w, h)
      const shade = new THREE.Mesh(shadeGeo, shadeMat)
      shade.position.set((A.x + B.x) / 2, yMid, zFront + 0.012)
      shade.renderOrder = 1
      machine.add(shade)
      disposables.push(shadeTex, shadeMat, shadeGeo)
      // the payline: a thin gold line with arrow tabs at both ends
      paylineMat = new THREE.MeshBasicMaterial({ color: 0xf2b42c, transparent: true, opacity: 0.35, depthWrite: false })
      const lineGeo = new THREE.PlaneGeometry(w - gap, 0.012)
      const line = new THREE.Mesh(lineGeo, paylineMat)
      line.position.set((A.x + B.x) / 2, yMid, zFront + 0.016)
      line.renderOrder = 2
      machine.add(line)
      const tabGeo = new THREE.CircleGeometry(0.045, 3)
      for (const s of [-1, 1]) {
        const tab = new THREE.Mesh(tabGeo, paylineMat)
        tab.position.set((s > 0 ? B.x : A.x) - s * 0.02, yMid, zFront + 0.017)
        tab.rotation.z = s > 0 ? 0 : Math.PI
        tab.renderOrder = 2
        machine.add(tab)
      }
      disposables.push(paylineMat, lineGeo, tabGeo)
      reelLight.position.set((A.x + B.x) / 2, B.y + 0.1, A.z + 0.35)
    }

    // ---- coins
    const COINS = 40
    const coinGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.016, 28)
    coinGeo.rotateX(Math.PI / 2)
    const coinMat = new THREE.MeshStandardMaterial({ color: 0xf2b42c, metalness: 1, roughness: 0.22, envMapIntensity: 1.6 })
    const coins = new THREE.InstancedMesh(coinGeo, coinMat, COINS)
    coins.castShadow = true
    coins.frustumCulled = false // its bounds are computed while every coin still sits at the origin
    coins.count = 0
    machine.add(coins)
    disposables.push(coinGeo, coinMat)
    let coinState = []
    const dummy = new THREE.Object3D()
    const burst = () => {
      coinState = Array.from({ length: COINS }, (_, i) => ({
        p: coinSpawn.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, 0)),
        v: new THREE.Vector3((Math.random() - 0.5) * 2.4, 2 + Math.random() * 1.8, 0.9 + Math.random() * 1.4),
        r: new THREE.Euler(Math.random() * 3, Math.random() * 3, 0),
        w: new THREE.Vector3(Math.random() * 14 - 7, Math.random() * 14 - 7, 0),
        delay: i * 0.018,
        age: 0,
      }))
      coins.count = COINS
    }
    const stepCoins = (dt) => {
      if (!coinState.length) return
      let alive = 0
      coinState.forEach((c, i) => {
        c.age += dt
        const t = c.age - c.delay
        let s = 0
        if (t > 0) {
          c.v.y -= 9.8 * dt
          c.p.addScaledVector(c.v, dt)
          if (c.p.y < 0.01) {
            c.p.y = 0.01
            c.v.y = Math.abs(c.v.y) * 0.3
            c.v.x *= 0.7
            c.v.z *= 0.7
            c.w.multiplyScalar(0.6)
          }
          c.r.x += c.w.x * dt
          c.r.y += c.w.y * dt
          s = t > 2.6 ? Math.max(0, 1 - (t - 2.6) / 0.5) : 1
        }
        if (s > 0 || t <= 0) alive++
        dummy.position.copy(c.p)
        dummy.rotation.copy(c.r)
        dummy.scale.setScalar(s)
        dummy.updateMatrix()
        coins.setMatrixAt(i, dummy.matrix)
      })
      coins.instanceMatrix.needsUpdate = true
      if (!alive) {
        coinState = []
        coins.count = 0
      }
    }

    // ---- the draw
    let show = null
    const clock = new THREE.Clock()

    const setNames = (list) => {
      if (show) return // never repaint a reel mid-spin
      reels.forEach((reel, i) => {
        const at = cellAt(reel.offset)
        const keep = reel.cells[at]
        reel.cells = reelStrip(list, i)
        if (keep?.win) reel.cells[at] = keep
        repaint(reel)
      })
    }

    // the winner's name on the payline of every reel
    const rest = (name) => {
      reels.forEach((reel) => {
        reel.cells.forEach((c) => delete c.win)
        if (name) reel.cells[cellAt(reel.offset)] = { kind: 'name', label: name, win: true }
        repaint(reel)
      })
      if (paylineMat) paylineMat.opacity = name ? 0.75 : 0.35
    }

    const finish = () => {
      const s = show
      show = null
      reels.forEach((reel) => {
        reel.speed = 0
        reel.stop = null
        reel.landAt = null
        reel.mat.map = reel.tex
      })
      if (lever) lever.rotation.x = lever.userData.rest
      if (paylineMat) paylineMat.opacity = 0.75
      if (!reduceMotion) burst()
      if (marquee) marquee.userData.flash = clock.getElapsedTime()
      setWinner({ key: s.key, name: s.name, shown: true })
      onDrawnRef.current?.(s.key)
    }

    const play = (d) => {
      if (!reels.length) return
      // paint the winner on the far side of each reel, where it can't be seen yet
      const targets = reels.map((reel) => {
        reel.cells.forEach((c) => delete c.win)
        const k = (cellAt(reel.offset) + CELLS / 2) % CELLS
        reel.cells[k] = { kind: 'name', label: d.name, win: true }
        repaint(reel)
        return k
      })
      show = { key: d.key, name: d.name, start: clock.getElapsedTime(), targets }
      if (paylineMat) paylineMat.opacity = 0.35
      setWinner({ key: d.key, name: d.name, shown: false })
      if (reduceMotion) {
        reels.forEach((reel, i) => setOffset(reel, offsetFor(targets[i])))
        finish()
      }
    }

    const animateShow = (now, dt) => {
      const s = show
      const k = now - s.start
      // the lever: down fast, back with a little spring
      if (lever) {
        const p = clamp01(k / T_PULL)
        const a = p < 0.3 ? ease(p / 0.3) : 1 - ease((p - 0.3) / 0.7) + Math.sin(((p - 0.3) / 0.7) * Math.PI) * 0.08
        lever.rotation.x = lever.userData.rest + a * 0.95
      }
      let stopped = 0
      reels.forEach((reel, i) => {
        if (k < T_SPIN + i * 0.08) return
        if (!reel.stop) {
          reel.speed = Math.min(SPEED, reel.speed + SPEED * dt * 3.5)
          let o = reel.offset + (reel.speed / CELLS) * dt
          if (k >= T_STOP[i]) {
            // stop on the target cell: pick the next turn that lands it, then once the reel
            // reaches the braking point travel exactly STOP_CELLS more
            const dist = STOP_CELLS / CELLS
            if (reel.landAt == null) {
              const base = offsetFor(s.targets[i])
              reel.landAt = base + Math.ceil(o + dist - base)
            }
            if (o >= reel.landAt - dist) {
              reel.stop = { from: reel.landAt - dist, to: reel.landAt, t0: now }
              o = reel.landAt - dist
              reel.landAt = null
            }
          }
          setOffset(reel, o)
        } else {
          const dur = (STOP_CELLS * (3 + OVERSHOOT)) / SPEED
          const p = clamp01((now - reel.stop.t0) / dur)
          setOffset(reel, reel.stop.from + (reel.stop.to - reel.stop.from) * backOut(p))
          reel.speed = SPEED * (1 - p)
          if (p >= 1) stopped++
        }
        reel.mat.map = reel.speed > SPEED * 0.45 ? reel.blurTex : reel.tex
      })
      if (stopped === REELS) finish()
    }

    api.current = { setNames, play, rest }

    // ---- load
    let disposed = false
    const draco = new DRACOLoader().setDecoderPath(DRACO_PATH)
    disposables.push(draco)
    const marks = {}
    new GLTFLoader()
      .setDRACOLoader(draco)
      .loadAsync(MODEL_URL)
      .then((gltf) => {
        if (disposed) return
        machine.add(gltf.scene)
        gltf.scene.updateMatrixWorld(true)
        gltf.scene.traverse((o) => {
          if (/^(Reel_A|Reel_B|Coin_Spawn)$/.test(o.name)) marks[o.name] = o.getWorldPosition(new THREE.Vector3())
          if (o.name === 'Slot_Lever') {
            lever = o
            lever.userData.rest = o.rotation.x
          }
          if (!o.isMesh) return
          o.castShadow = true
          o.receiveShadow = true
          const m = o.material
          if (m.name === 'TG_Cabinet') {
            // the Meshy cabinet (and its lever, split from it): keep the texture maps, add the
            // site's lacquer; one material for both so the bulbs pulse together
            o.material = marquee ?? new THREE.MeshPhysicalMaterial({
              color: m.color,
              map: m.map,
              normalMap: m.normalMap,
              roughnessMap: m.roughnessMap,
              metalnessMap: m.metalnessMap,
              roughness: m.roughness,
              metalness: m.metalness,
              emissive: m.emissiveMap ? new THREE.Color(0xffffff) : new THREE.Color(0),
              emissiveMap: m.emissiveMap,
              emissiveIntensity: 2,
              clearcoat: 0.8,
              clearcoatRoughness: 0.1,
              envMapIntensity: 1.2,
            })
            marquee = o.material
            m.dispose()
          } else if (m.name === 'TG_Glass') {
            o.material = new THREE.MeshPhysicalMaterial({
              color: 0xe8f3ff,
              roughness: 0.04,
              transparent: true,
              opacity: 0.08,
              depthWrite: false,
              envMapIntensity: 1.6,
              clearcoat: 1,
              clearcoatRoughness: 0.02,
            })
            o.castShadow = false
            o.renderOrder = 3
            m.dispose()
          } else if (m.name === 'TG_Logo') {
            m.transparent = true
            m.alphaTest = 0.4
            m.emissive = new THREE.Color(0xffffff)
            m.emissiveMap = m.map
            m.emissiveIntensity = 0.55
            o.castShadow = false
          }
          disposables.push(o.geometry, o.material)
        })
        if (marks.Coin_Spawn) coinSpawn.copy(marks.Coin_Spawn)
        if (marks.Reel_A && marks.Reel_B) {
          const A = new THREE.Vector3(Math.min(marks.Reel_A.x, marks.Reel_B.x), Math.min(marks.Reel_A.y, marks.Reel_B.y), marks.Reel_A.z)
          const B = new THREE.Vector3(Math.max(marks.Reel_A.x, marks.Reel_B.x), Math.max(marks.Reel_A.y, marks.Reel_B.y), marks.Reel_A.z)
          buildReels(A, B)
        }
        // frame the whole machine
        const box = new THREE.Box3().setFromObject(gltf.scene)
        box.getCenter(frameCenter)
        box.getSize(frameSize)
        frameCenter.z = 0
        resize()
        for (const l of [key, fill, rim, rim2]) l.target.position.copy(frameCenter)
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ opacity: 0.4 }))
        floor.rotation.x = -Math.PI / 2
        floor.receiveShadow = true
        machine.add(floor)
        disposables.push(floor.geometry, floor.material)
        setStatus('ready')
      })
      .catch(() => setStatus('unsupported'))

    let visible = true
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
    })
    io.observe(host)

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host
      if (!w || !h) return
      renderer.setSize(w, h, false)
      composer.setSize(w, h)
      camera.aspect = w / h
      // fit the machine with some air; on tall (phone) stages leave room above it for the chip
      const tall = w / h < 1
      const fit = Math.max((frameSize.x * 1.5) / (w / h), frameSize.y * (tall ? 1.34 : 1.2))
      look.copy(frameCenter).setY(frameCenter.y + frameSize.y * (tall ? 0.02 : -0.03))
      const dist = fit / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
      const dir = new THREE.Vector3(0.3, 0.12, 1).normalize()
      camera.position.copy(look).addScaledVector(dir, dist)
      camera.lookAt(look)
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host)
    resize()

    let frame = 0
    let last = 0
    const render = () => {
      frame = requestAnimationFrame(render)
      if (!visible) return
      const now = clock.getElapsedTime()
      const dt = Math.min(1 / 30, now - last)
      last = now
      if (show) animateShow(now, dt)
      stepCoins(dt)
      if (marquee) {
        const f = now - (marquee.userData.flash ?? -9)
        const flash = f < 1.6 ? (Math.sin(f * 22) > 0 ? 4.5 : 1.2) : 0
        marquee.emissiveIntensity = flash || (reduceMotion ? 2 : 1.4 + 1.4 * (0.5 + 0.5 * Math.sin(now * 3)))
      }
      if (paylineMat && !show && paylineMat.opacity > 0.5 && !reduceMotion) paylineMat.opacity = 0.62 + 0.25 * Math.sin(now * 4)
      composer.render()
    }
    render()

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      io.disconnect()
      ro.disconnect()
      disposables.forEach((d) => d?.dispose?.())
      composer.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      api.current = null
    }
  }, [])

  const namesKey = names.join('\u0000')
  useEffect(() => {
    if (status === 'ready') api.current?.setNames(names)
  }, [namesKey, status]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (status === 'ready' && !draw) api.current?.rest(resting)
    if (!draw) setWinner(resting ? { key: 'rest', name: resting, shown: true } : null)
  }, [resting, status, draw])

  useEffect(() => {
    if (status !== 'ready' || !draw || draw.key === seenDraw.current) return
    seenDraw.current = draw.key
    api.current?.play(draw)
  }, [draw, status])

  return (
    <div className={`slot-machine slot-machine--${status}`}>
      <div className="slot-machine__stage" ref={hostRef} />
      {status === 'loading' && <span className="slot-machine__loading" aria-hidden="true" />}
      {status === 'unsupported' && <span className="slot-machine__fallback">3D view unavailable</span>}
      {winner?.shown && (
        <div className="slot-machine__winner" key={winner.key} role="status">
          <span className="slot-machine__winner-label">Winner</span>
          <span className="slot-machine__winner-name">{winner.name}</span>
        </div>
      )}
    </div>
  )
}
