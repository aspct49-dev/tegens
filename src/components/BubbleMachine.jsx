import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Reflector } from 'three/addons/objects/Reflector.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import BallViewer from './BallViewer'
import { drawTgnMark, loadTgnMark, tgnMark } from '../tgnMark'

/*
 * The TGN bubble raffle machine (public/models/bubble_machine.glb, built in Blender by
 * trophy/bubble-machine/build_bubble_machine.py; see that folder's README.md).
 *
 * The GLB carries the whole draw as one baked animation (30 fps, frames 1-600): 40 balls mixed
 * by air, the DRAW button press, the port gate, and the winning ball (Ball_27, userData
 * is_winner) travelling down the tube onto the lit cradle. This component plays it and paints
 * the live values: entrants' names on the balls (`names`, see pickBallNames), the winner's
 * name on the winning ball, and both displays. It also builds the stage around the machine
 * (plinth, glossy floor, slatted back wall with LED strips), and a click on a ball opens it
 * up close (BallViewer).
 *
 * Same ref API as RaffleMachine, so the raffle page can use either:
 *   triggerHandleAnimation()   play the draw (DRAW press -> mix -> extraction -> reveal); resolves at the end
 *   startDrumRotation()        idle: balls resting, the diffuser puffs (ignored while drawing)
 *   setNumber(n)               winner player number (WINNER display sub line); shows the result when idle
 *   setTicket(name)            winner name: on the winning ball and big on the WINNER display
 *   setEntries(n)              TOTAL ENTRIES display
 *   stopDrumRotation(), setDrumDigit()  no-ops (kept for API compatibility)
 *
 * Props: names (array of strings or { name, tickets, share }; 40 used, ball n = names[n-1]),
 * entries (TOTAL ENTRIES), inspect (default true: click a ball to see it), onReady.
 */

const MODEL_URL = '/models/bubble_machine.glb'
const DRACO_PATH = '/draco/'

// The model is 1.6 MB: the raffle page starts downloading it as soon as it opens (before
// the raffle data arrives), so the machine can appear the moment the stage mounts.
let modelBytes = null
export function preloadBubbleMachine() {
  if (!modelBytes) {
    modelBytes = fetch(MODEL_URL).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
    modelBytes.catch(() => {
      modelBytes = null // let the next attempt retry
    })
  }
  return modelBytes
}
const FPS = 30
const F_IDLE_END = 120
const F_DRAW_START = 116 // just before the DRAW press
const F_END = 600
const F_NUMBER_ON = 530 // the WINNER display lights here
const F_SELECT = 360 // the winning ball leaves the mix here
const ATLAS_CELLS = 8

const clamp01 = (t) => Math.min(1, Math.max(0, t))
const smooth = (t) => {
  t = clamp01(t)
  return t * t * (3 - 2 * t)
}
const lerpKeys = (f, keys) => {
  if (f <= keys[0][0]) return keys[0][1]
  for (let i = 1; i < keys.length; i++) {
    const [f1, v1] = keys[i]
    const [f0, v0] = keys[i - 1]
    if (f <= f1) return v0 + (v1 - v0) * smooth((f - f0) / (f1 - f0))
  }
  return keys[keys.length - 1][1]
}
// same curves as the Blender controls (CTRL_DrawSequence)
const glowAt = (f) =>
  lerpKeys(f, [[1, 0.3], [60, 0.38], [120, 0.3], [124, 0.55], [150, 1], [182, 1.15], [360, 1.15], [400, 0.7], [446, 0.65], [500, 0.55], [600, 0.5]])
const warmAt = (f) => lerpKeys(f, [[1, 0], [498, 0], [504, 1.25], [520, 1], [600, 1]])
const numberAt = (f) => lerpKeys(f, [[528, 0], [530, 1], [532, 0.15], [534, 1], [536, 0.4], [540, 1]])

const fontReady = () => (document.fonts?.ready ?? Promise.resolve()).catch(() => {})
const N_BALLS = 40
const CELL = 256
const FONT = 'Rubik, system-ui, sans-serif'

// ---------------------------------------------------------------- names on the balls

const hash = (s) => {
  let h = 2166136261
  for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}
const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) >>> 0
  let t = seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/**
 * The 40 balls' names for a raffle, the same on every render (seeded by `seed`, e.g. the raffle
 * id). More than 40 entrants: 40 picked at random weighted by tickets. Fewer: everyone gets a
 * ball and the rest go out in proportion to tickets. → [{ name, tickets, share }] × 40, or []
 * with nobody holding a ticket. `nameOf(entry)`: the name as the page shows it (masked or not).
 */
export function pickBallNames(entries, seed, nameOf = (e) => e.name) {
  const pool = (entries ?? []).filter((e) => e.tickets > 0)
  if (!pool.length) return []
  const total = pool.reduce((s, e) => s + e.tickets, 0)
  const ball = (e) => ({ name: String(nameOf(e) ?? ''), tickets: e.tickets, share: e.tickets / total })
  const rand = rng(hash(`${seed}`))
  let list
  if (pool.length > N_BALLS) {
    const left = [...pool]
    let sum = total
    list = []
    while (list.length < N_BALLS) {
      let r = rand() * sum
      let i = left.findIndex((e) => (r -= e.tickets) < 0)
      if (i < 0) i = left.length - 1
      const [e] = left.splice(i, 1)
      sum -= e.tickets
      list.push(ball(e))
    }
  } else {
    // one each, then the spare balls by largest remainder of the ticket share
    const spare = N_BALLS - pool.length
    const want = pool.map((e) => (e.tickets / total) * spare)
    const counts = want.map((w) => 1 + Math.floor(w))
    let rest = N_BALLS - counts.reduce((s, n) => s + n, 0)
    const order = want.map((w, i) => [w - Math.floor(w), i]).sort((a, b) => b[0] - a[0])
    for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) counts[order[k][1]]++
    list = pool.flatMap((e, i) => Array.from({ length: counts[i] }, () => ball(e)))
  }
  // shuffle so one name isn't bunched together
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

const ballName = (b) => (b == null ? '' : typeof b === 'string' ? b : (b.name ?? ''))

/** The largest font (from `max` down to `min`) at which `text` fits `width`; null if none */
function fitFont(g, text, width, max, min, weight = 700) {
  for (let s = max; s >= min; s -= 2) {
    g.font = `${weight} ${s}px ${FONT}`
    if (g.measureText(text).width <= width) return s
  }
  return null
}

/** Split a name into two lines: at _ . - or a case change nearest the middle, else the middle */
function splitName(s) {
  const mid = s.length / 2
  let best = -1
  for (let i = 1; i < s.length; i++) {
    const brk = /[_.\-\s]/.test(s[i]) || (/[a-z]/.test(s[i - 1]) && /[A-Z]/.test(s[i]))
    if (brk && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i
  }
  const at = best > 0 && Math.abs(best - mid) <= s.length * 0.3 ? best : Math.ceil(mid)
  return [s.slice(0, at).replace(/[_\s]$/, ''), s.slice(at).replace(/^[_\s]/, '')]
}

/**
 * One ball face into a 256px cell at (x, y): a player's name (TGN mark above it) or, with no
 * name, the Blender atlas's number style (ring + number). The cell spans the whole ball, so
 * text stays inside the middle ~170px where the sphere barely bends it.
 */
function paintCell(g, x, y, face) {
  g.save()
  g.translate(x, y)
  g.beginPath()
  g.rect(0, 0, CELL, CELL)
  g.clip()
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, CELL, CELL)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  if (typeof face === 'string' && face) {
    // the TGN logo above the name (a TGN-blue word + rule until the logo has loaded)
    if (!drawTgnMark(g, 128, 70, 38)) {
      g.fillStyle = '#1f6fe0'
      g.font = `700 20px ${FONT}`
      if ('letterSpacing' in g) g.letterSpacing = '3px'
      g.fillText('TGN', 129.5, 78)
      if ('letterSpacing' in g) g.letterSpacing = '0px'
      g.fillRect(104, 92, 48, 3)
    }
    g.fillStyle = '#0b1218'
    const W = 172
    const one = fitFont(g, face, W, 60, 30)
    if (one) g.fillText(face, 128, 136)
    else {
      const [a, b] = splitName(face)
      const size = Math.min(fitFont(g, a, W, 44, 22) ?? 22, fitFont(g, b, W, 44, 22) ?? 22)
      g.font = `700 ${size}px ${FONT}`
      const clip = (t) => {
        let s = t
        while (g.measureText(s).width > W && s.length > 2) s = s.slice(0, -1)
        return s === t ? t : `${s.slice(0, -1)}…`
      }
      g.fillText(clip(a), 128, 136 - size * 0.55)
      g.fillText(clip(b), 128, 136 + size * 0.55)
    }
  } else {
    g.strokeStyle = '#000'
    g.lineWidth = 6.4
    g.beginPath()
    g.arc(128, 128, 87.6, 0, Math.PI * 2)
    g.stroke()
    const s = face == null || face === '' ? '' : String(face)
    g.fillStyle = '#000'
    if (!s) {
      // a spare cell: just the logo
      if (!drawTgnMark(g, 128, 128, 70)) {
        g.font = `700 54px ${FONT}`
        g.fillText('TGN', 128, 132)
      }
    } else if (drawTgnMark(g, 128, 76, 32)) {
      // the logo small inside the ring, the number under it
      const size = s.length <= 1 ? 90 : s.length === 2 ? 76 : s.length === 3 ? 58 : 46
      g.fillStyle = '#000'
      g.font = `700 ${size}px ${FONT}`
      g.fillText(s, 128, 150)
    } else {
      const size = s.length <= 1 ? 104 : s.length === 2 ? 88 : s.length === 3 ? 68 : 54
      g.font = `700 ${size}px ${FONT}`
      g.fillText(s, 128, 132)
    }
  }
  g.restore()
}

/** Every ball's name on one 8×8 atlas, laid out like the Blender number atlas */
function paintAtlas(c, names) {
  const g = c.getContext('2d')
  for (let n = 1; n <= ATLAS_CELLS * ATLAS_CELLS; n++) {
    const face = n <= N_BALLS ? ballName(names[n - 1]) || n : ''
    paintCell(g, ((n - 1) % ATLAS_CELLS) * CELL, Math.floor((n - 1) / ATLAS_CELLS) * CELL, face)
  }
}

// a display face (TOTAL ENTRIES / WINNER), drawn to fit the screen glass
function paintScreen(c, { label, value, valueColor, sub, dim }) {
  const g = c.getContext('2d')
  const { width: w, height: h } = c
  g.fillStyle = '#03070b'
  g.fillRect(0, 0, w, h)
  const glow = g.createRadialGradient(w / 2, h * 0.55, 0, w / 2, h * 0.55, w * 0.6)
  glow.addColorStop(0, 'rgba(31,111,224,0.10)')
  glow.addColorStop(1, 'rgba(31,111,224,0)')
  g.fillStyle = glow
  g.fillRect(0, 0, w, h)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#4db8ff'
  g.font = `500 ${Math.round(h * 0.13)}px Rubik, system-ui, sans-serif`
  if ('letterSpacing' in g) g.letterSpacing = `${Math.round(h * 0.015)}px`
  g.fillText(label, w / 2, h * 0.2)
  if ('letterSpacing' in g) g.letterSpacing = '0px'
  g.fillRect(w * 0.2, h * 0.31, w * 0.6, Math.max(2, h * 0.012))
  g.shadowColor = valueColor
  g.shadowBlur = h * 0.08
  g.globalAlpha = dim ?? 1
  g.fillStyle = valueColor
  const v = String(value)
  const vs = v.length > 5 ? 0.3 : v.length > 3 ? 0.38 : 0.46
  // as big as fits the glass (names can be long)
  fitFont(g, v, w * 0.86, Math.round(h * vs), Math.round(h * 0.14))
  if (g.measureText(v).width > w * 0.86) g.font = `700 ${Math.round(h * 0.14)}px ${FONT}`
  let shown = v
  while (g.measureText(shown).width > w * 0.9 && shown.length > 3) shown = shown.slice(0, -1)
  g.fillText(shown === v ? v : `${shown.slice(0, -1)}…`, w / 2, sub ? h * 0.6 : h * 0.64)
  g.shadowBlur = 0
  if (sub) {
    g.fillStyle = '#9cc4de'
    g.font = `600 ${Math.round(h * 0.12)}px Rubik, system-ui, sans-serif`
    let s = sub
    while (g.measureText(s).width > w * 0.86 && s.length > 3) s = s.slice(0, -2)
    if (s !== sub) s = s.slice(0, -1) + '…'
    g.fillText(s, w / 2, h * 0.86)
  }
  g.globalAlpha = 1
}

// ---------------------------------------------------------------- the stage

const STAGE_BG = 0x060c13

/**
 * The room the machine stands in: a dark glossy floor (a low-res mirror under a tinted
 * glaze), a low plinth with a thin LED edge, and a curved back wall of vertical slats with a
 * few TGN-blue LED strips between them. Built around the machine's bounding box.
 * → { group, floorY, dispose }
 */
function buildStage(box, renderer) {
  const group = new THREE.Group()
  const owned = []
  const own = (...xs) => (owned.push(...xs), xs[0])
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const floorY = box.min.y
  const plinthH = size.y * 0.035
  const groundY = floorY - plinthH

  // floor: mirror + glaze (the glaze takes the shadows and keeps the reflection faint)
  const px = Math.min(renderer.getPixelRatio(), 1.5)
  const mirror = new Reflector(own(new THREE.PlaneGeometry(40, 40)), {
    textureWidth: 512 * px,
    textureHeight: 512 * px,
    color: 0x6f7c88,
  })
  mirror.rotation.x = -Math.PI / 2
  mirror.position.set(center.x, groundY - 0.002, center.z)
  own(mirror.getRenderTarget(), mirror.material)
  // the glaze is unlit, so the blue rim lights behind the machine don't wash the floor out
  const glaze = new THREE.Mesh(
    own(new THREE.PlaneGeometry(40, 40)),
    own(new THREE.MeshBasicMaterial({ color: STAGE_BG, transparent: true, opacity: 0.9 })),
  )
  glaze.rotation.x = -Math.PI / 2
  glaze.position.set(center.x, groundY, center.z)
  // a soft pool of light around the plinth
  const poolCvs = document.createElement('canvas')
  poolCvs.width = poolCvs.height = 256
  const pg = poolCvs.getContext('2d')
  const grad = pg.createRadialGradient(128, 128, 0, 128, 128, 128)
  grad.addColorStop(0, 'rgba(32,58,84,0.55)')
  grad.addColorStop(0.55, 'rgba(22,42,62,0.22)')
  grad.addColorStop(1, 'rgba(22,42,62,0)')
  pg.fillStyle = grad
  pg.fillRect(0, 0, 256, 256)
  const poolTex = own(new THREE.CanvasTexture(poolCvs))
  poolTex.colorSpace = THREE.SRGBColorSpace
  const pool = new THREE.Mesh(
    own(new THREE.PlaneGeometry(size.y * 3.6, size.y * 2.6)),
    own(new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false })),
  )
  pool.rotation.x = -Math.PI / 2
  pool.position.set(center.x, groundY + 0.001, center.z)
  const shadow = new THREE.Mesh(own(new THREE.PlaneGeometry(40, 40)), own(new THREE.ShadowMaterial({ opacity: 0.55 })))
  shadow.rotation.x = -Math.PI / 2
  shadow.position.set(center.x, groundY + 0.002, center.z)
  shadow.receiveShadow = true
  group.add(mirror, glaze, pool, shadow)

  // plinth: a rounded slab with a hairline LED edge
  const r = Math.max(size.x, size.z) * 0.64
  const plinth = new THREE.Mesh(
    own(new THREE.CylinderGeometry(r, r * 1.02, plinthH, 96)),
    own(new THREE.MeshPhysicalMaterial({ color: 0x0d1a26, roughness: 0.32, metalness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.1 })),
  )
  plinth.position.set(center.x, groundY + plinthH / 2, center.z)
  plinth.receiveShadow = true
  plinth.castShadow = true
  const ledMat = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0x4db8ff).multiplyScalar(1.25), toneMapped: false }))
  const edge = new THREE.Mesh(own(new THREE.TorusGeometry(r * 1.004, plinthH * 0.07, 6, 160)), ledMat)
  edge.rotation.x = Math.PI / 2
  edge.position.set(center.x, groundY + plinthH * 0.92, center.z)
  group.add(plinth, edge)

  // back wall: a shallow concave arc behind the machine, wider than any view of it
  const R = size.y * 4.5
  const wallH = size.y * 3.4
  const back = size.y * 0.85 // from the machine's centre to the wall
  const span = 2 * Math.asin(Math.min(0.95, (size.y * 2.8) / R))
  const wallCenter = new THREE.Vector3(center.x, groundY, center.z - back + R)
  const start = -Math.PI / 2 - span / 2 // the arc's angles run (cos a, sin a), centred on -z
  const wallMat = own(new THREE.MeshStandardMaterial({ color: 0x0a1622, roughness: 0.85, metalness: 0.1, side: THREE.BackSide }))
  // CylinderGeometry puts theta at (sin θ, cos θ); angle a here is (cos a, sin a), so θ = π/2 − a
  const wall = new THREE.Mesh(own(new THREE.CylinderGeometry(R, R, wallH, 96, 1, true, Math.PI / 2 - start - span, span)), wallMat)
  wall.position.set(wallCenter.x, groundY + wallH / 2, wallCenter.z)
  wall.receiveShadow = true
  group.add(wall)

  // slats: thin vertical fins standing off the wall
  const pitch = size.y * 0.085
  const slatCount = Math.round((R * span) / pitch)
  const slatGeo = own(new THREE.BoxGeometry(pitch * 0.42, wallH, pitch * 0.55))
  const slatMat = own(new THREE.MeshStandardMaterial({ color: 0x12243a, roughness: 0.5, metalness: 0.4 }))
  const slats = new THREE.InstancedMesh(slatGeo, slatMat, slatCount)
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const one = new THREE.Vector3(1, 1, 1)
  const at = (a, inset) => new THREE.Vector3(wallCenter.x + Math.cos(a) * (R - inset), groundY + wallH / 2, wallCenter.z + Math.sin(a) * (R - inset))
  for (let i = 0; i < slatCount; i++) {
    const a = start + (span * (i + 0.5)) / slatCount
    q.setFromAxisAngle(up, Math.PI / 2 - a)
    m4.compose(at(a, pitch * 0.3), q, one)
    slats.setMatrixAt(i, m4)
  }
  slats.receiveShadow = true
  group.add(slats)

  // LED strips: four, in the gaps either side of the machine (x from the centre, in world units)
  const stripMat = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2f8fe0).multiplyScalar(1.1), toneMapped: false }))
  const stripGeo = own(new THREE.BoxGeometry(pitch * 0.12, wallH, pitch * 0.12))
  for (const x of [-2.05, -1.0, 1.0, 2.05]) {
    // snap to the gap between two slats
    const raw = -Math.PI / 2 + Math.asin((x * size.y * 0.5) / R)
    const i = Math.round(((raw - start) * slatCount) / span)
    const a = start + (span * i) / slatCount
    const s = new THREE.Mesh(stripGeo, stripMat)
    s.position.copy(at(a, pitch * 0.1))
    s.quaternion.setFromAxisAngle(up, Math.PI / 2 - a)
    group.add(s)
  }
  return {
    group,
    floorY: groundY,
    dispose: () => owned.forEach((o) => o?.dispose?.()),
  }
}

const BubbleMachine = forwardRef(function BubbleMachine({ onReady, entries, names, inspect = true }, ref) {
  const hostRef = useRef(null)
  const api = useRef(null)
  const [status, setStatus] = useState('loading')
  const [picked, setPicked] = useState(null) // the ball being looked at: { name, number, tickets, share }
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  const entriesRef = useRef(entries)
  const namesRef = useRef(names ?? [])
  const inspectRef = useRef(inspect)
  inspectRef.current = inspect

  useImperativeHandle(ref, () => ({
    startDrumRotation: () => api.current?.idle(),
    stopDrumRotation: () => Promise.resolve(),
    setDrumDigit: () => Promise.resolve(),
    setNumber: (n) => api.current?.setNumber(n) ?? Promise.resolve(),
    triggerHandleAnimation: () => api.current?.draw() ?? Promise.resolve(),
    setTicket: (name, subtitle) => api.current?.setName(name, subtitle),
    setEntries: (n) => api.current?.setEntries(n),
    isHandleBusy: () => api.current?.busy() ?? false,
  }))

  useEffect(() => {
    entriesRef.current = entries
    api.current?.setEntries(entries)
  }, [entries])

  // repaint the balls only when the names themselves change
  const namesKey = (names ?? []).map(ballName).join('')
  useEffect(() => {
    namesRef.current = names ?? []
    api.current?.setNames(namesRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey])

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
    renderer.setPixelRatio(Math.min(Math.max(window.devicePixelRatio, 1.5), 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.AgXToneMapping
    renderer.toneMappingExposure = 0.82
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(STAGE_BG)
    scene.fog = new THREE.Fog(STAGE_BG, 9, 22) // the floor's far edge melts into the dark
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = envTexture
    scene.environmentIntensity = 0.16

    const key = new THREE.DirectionalLight(0xfff1e2, 1.25)
    key.position.set(-3.5, 5.5, 5)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.bias = -0.0003
    key.shadow.normalBias = 0.02
    key.shadow.radius = 5
    Object.assign(key.shadow.camera, { left: -2, right: 2, top: 3, bottom: -0.5, near: 1, far: 20 })
    const fill = new THREE.DirectionalLight(0xdbe9ff, 0.16)
    fill.position.set(5, 2, 3.5)
    const rim = new THREE.DirectionalLight(0x4db8ff, 1.15)
    rim.position.set(-3, 3, -4)
    const rim2 = new THREE.DirectionalLight(0x4db8ff, 1.0)
    rim2.position.set(3, 3, -4)
    const top = new THREE.DirectionalLight(0xffffff, 0.22)
    top.position.set(0, 6, 0.8)
    for (const l of [key, fill, rim, rim2, top]) scene.add(l, l.target)
    const chamberLight = new THREE.PointLight(0xcfe8ff, 1.2, 2.2, 1.6)
    chamberLight.position.set(0, 1.82, -0.12) // under the cover, so its highlight stays off the front glass
    const podLight = new THREE.PointLight(0xffd9a6, 0, 0.8, 1.6)
    podLight.position.set(0, 0.6, 0.56)
    scene.add(chamberLight, podLight)

    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 80)
    const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }))
    composer.addPass(new RenderPass(scene, camera))
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), 0.22, 0.3, 0.97))
    composer.addPass(new OutputPass())

    const machine = new THREE.Group()
    scene.add(machine)
    const disposables = [envTexture, pmrem]

    // ---- state
    let mixer = null
    let mode = 'idle' // idle | draw | result
    let drawStart = 0
    let drawRun = null // { resolve, promise }
    let number = null
    let name = ''
    let entriesN = entriesRef.current
    const ledMats = []
    const warmMats = []
    let ballCvs = null
    let ballTex = null
    let ballOwn = 27 // the winning ball's own number (it mixes as an ordinary ball)
    let ballShown // what is painted on it now
    let ballNames = namesRef.current
    let atlasCvs = null // every ball's name (null until there are names)
    let atlasTex = null
    let ballMat = null // the shared M_BallPearl
    let numberMap = null // the GLB's own number atlas
    const ballMeshes = [] // [{ mesh, n }] for picking
    const screens = {} // entries / winner: { canvas, tex }
    let lastScreenKey = ''
    const frameCenter = new THREE.Vector3(0, 1.0, 0)
    const frameSize = new THREE.Vector3(1.4, 2.0, 1.2)
    const clock = new THREE.Clock()

    const hasWinner = () => !!name || number != null
    const winnerShown = (f) => hasWinner() && (mode === 'result' || (mode === 'draw' && f >= F_SELECT))
    /** What ball n carries: a name, or its number when there are no names */
    const ownFace = (n) => ballName(ballNames[n - 1]) || n
    // the winning ball wears its own face while idle and mixing, and the winner's name from
    // the selection on (and in the result)
    const repaintBall = (f) => {
      if (!ballCvs) return
      const want = winnerShown(f) ? name || number : ownFace(ballOwn)
      if (want === ballShown) return
      ballShown = want
      paintCell(ballCvs.getContext('2d'), 0, 0, want)
      ballTex.needsUpdate = true
    }
    /**
     * Names on every ball (the shared atlas). With no names the balls carry numbers: painted
     * here too once the TGN logo has loaded (logo + number), else the GLB's own number atlas.
     */
    const applyNames = () => {
      ballShown = undefined
      if (!ballMat) return
      if (!ballNames.some((b) => ballName(b)) && !tgnMark()) {
        if (numberMap && ballMat.map !== numberMap) {
          ballMat.map = numberMap
          ballMat.needsUpdate = true
        }
        return
      }
      if (!atlasCvs) {
        atlasCvs = document.createElement('canvas')
        atlasCvs.width = atlasCvs.height = CELL * ATLAS_CELLS
        atlasTex = new THREE.CanvasTexture(atlasCvs)
        atlasTex.colorSpace = THREE.SRGBColorSpace
        atlasTex.flipY = false
        atlasTex.anisotropy = 8
        disposables.push(atlasTex)
      }
      paintAtlas(atlasCvs, ballNames)
      atlasTex.needsUpdate = true
      if (ballMat.map !== atlasTex) {
        ballMat.map = atlasTex
        ballMat.needsUpdate = true
      }
    }
    const repaintScreens = (f) => {
      const on = mode === 'result' || (mode === 'draw' && f >= F_NUMBER_ON - 2)
      const dim = mode === 'draw' ? numberAt(f) : 1
      const shown = on && hasWinner()
      const k = `${entriesN}|${shown}|${number}|${name}|${dim.toFixed(2)}`
      if (k === lastScreenKey) return
      lastScreenKey = k
      if (screens.entries) {
        paintScreen(screens.entries.canvas, { label: 'TOTAL ENTRIES', value: entriesN ?? '—', valueColor: '#d4efff' })
        screens.entries.tex.needsUpdate = true
      }
      if (screens.winner) {
        paintScreen(
          screens.winner.canvas,
          shown
            ? name
              ? { label: 'WINNER', value: name, valueColor: '#ffd27a', sub: number != null ? `PLAYER #${String(number).padStart(4, '0')}` : '', dim }
              : { label: 'WINNER', value: number, valueColor: '#ffd27a', dim }
            : { label: 'WINNER', value: '– –', valueColor: '#4db8ff', dim: 0.85 },
        )
        screens.winner.tex.needsUpdate = true
      }
    }

    const draw = () => {
      if (!mixer) return Promise.resolve()
      if (drawRun) return drawRun.promise
      let resolve
      const promise = new Promise((r) => (resolve = r))
      drawRun = { resolve, promise }
      mode = 'draw'
      drawStart = clock.getElapsedTime()
      if (reduceMotion) {
        mode = 'result'
        drawRun = null
        resolve()
      }
      return promise
    }
    api.current = {
      draw,
      idle: () => {
        if (mode !== 'draw') mode = 'idle'
      },
      setNumber: (n) => {
        number = n == null ? null : Math.floor(n)
        ballShown = undefined
        if (mode === 'draw') return drawRun.promise
        mode = 'result'
        return Promise.resolve()
      },
      setName: (n) => {
        name = n || ''
        ballShown = undefined
      },
      setNames: (list) => {
        ballNames = list ?? []
        applyNames()
      },
      setEntries: (n) => {
        entriesN = n
      },
      busy: () => !!drawRun,
    }

    // ---- materials (named in Blender: M_*)
    const physical = (m, extra) => {
      const p = new THREE.MeshPhysicalMaterial({
        color: m.color,
        map: m.map,
        metalness: m.metalness,
        roughness: m.roughness,
        emissive: m.emissive,
        emissiveIntensity: m.emissiveIntensity,
        emissiveMap: m.emissiveMap,
        ...extra,
      })
      p.name = m.name
      return p
    }
    // additive glass: a black base that only adds its reflections and highlights, so the
    // chamber stays crystal clear instead of greying everything behind it
    const glass = (m, strength) =>
      physical(m, {
        color: 0x000000,
        metalness: 0,
        roughness: 0.04,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        clearcoat: 0.5,
        clearcoatRoughness: 0.03,
        envMapIntensity: strength,
        side: THREE.DoubleSide,
      })
    const materialFor = (m) => {
      switch (m.name) {
        case 'M_ChamberGlass':
          return glass(m, 0.55)
        case 'M_TubeAcrylic':
          return glass(m, 0.6)
        case 'M_PodWindow':
          return glass(m, 0.5)
        case 'M_Gunmetal':
        case 'M_BrushedBlack':
          // no anisotropy / roughness map: these parts have no UVs (anisotropy would give NaNs)
          return physical(m, { roughness: m.name === 'M_Gunmetal' ? 0.34 : 0.44, anisotropy: 0, envMapIntensity: 0.75 })
        case 'M_BodyNavy':
        case 'M_BodyNavyDark':
          return physical(m, { roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.08, envMapIntensity: 0.7 })
        case 'M_Chrome':
          return physical(m, { roughness: 0.1, envMapIntensity: 0.95 })
        case 'M_Gold':
          return physical(m, { roughness: 0.28, envMapIntensity: 0.9 })
        case 'M_BallPearl':
          return physical(m, { roughness: 0.32, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.06, envMapIntensity: 0.45, side: THREE.FrontSide })
        case 'M_LED_Warm':
          return physical(m, { emissive: new THREE.Color(0xffd9a6), emissiveIntensity: 0 })
        case 'M_ButtonCap':
          return physical(m, { roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.0 })
        default:
          return m
      }
    }

    // ---- load
    let disposed = false
    const draco = new DRACOLoader().setDecoderPath(DRACO_PATH)
    disposables.push(draco)
    draco.preload()
    const loader = new GLTFLoader().setDRACOLoader(draco)
    preloadBubbleMachine()
      .then((bytes) => loader.parseAsync(bytes, ''))
      .then(async (gltf) => {
        if (disposed) return
        const root = gltf.scene
        machine.add(root)
        const swapped = new Map()
        const hide = /^Display_(Entries|Winner)_(Label|Underline|Value|Idle)$/
        root.traverse((o) => {
          if (!o.isMesh) return
          if (hide.test(o.name)) {
            o.visible = false
            return
          }
          o.castShadow = !/Glass|Acrylic|Window|LED/.test(o.material.name)
          o.receiveShadow = true
          const m = o.material
          if (!swapped.has(m)) swapped.set(m, materialFor(m))
          o.material = swapped.get(m)
          if (/^M_(ChamberGlass|TubeAcrylic|PodWindow)$/.test(o.material.name)) o.renderOrder = 2
          disposables.push(o.geometry)
        })
        swapped.forEach((mm, orig) => {
          disposables.push(mm)
          if (mm !== orig) orig.dispose()
          if (/^M_LED_(Blue|Deep)$/.test(mm.name)) ledMats.push({ m: mm, base: mm.emissiveIntensity || 3.8 })
          if (mm.name === 'M_LED_Warm') warmMats.push(mm)
          if (mm.name === 'M_BallPearl') {
            ballMat = mm
            numberMap = mm.map
          }
        })

        // every ball, for clicking: Ball_NN (the mesh, or the node holding it)
        root.traverse((o) => {
          if (!o.isMesh) return
          const m = /^Ball_(\d+)/.exec(o.name) ?? /^Ball_(\d+)/.exec(o.parent?.name ?? '')
          if (m) ballMeshes.push({ mesh: o, n: Number(m[1]) })
        })

        // the winner ball gets its own face (its name, then the winner's); the others share the atlas
        let winner = null
        root.traverse((o) => {
          if (!winner && (o.userData?.is_winner || o.name === 'Ball_27')) winner = o
        })
        const wMesh = winner?.isMesh ? winner : winner?.getObjectByProperty('isMesh', true)
        if (wMesh) {
          const n = winner.userData?.number ?? 27
          ballOwn = n
          ballCvs = document.createElement('canvas')
          ballCvs.width = ballCvs.height = 256
          ballTex = new THREE.CanvasTexture(ballCvs)
          ballTex.colorSpace = THREE.SRGBColorSpace
          ballTex.flipY = false
          ballTex.repeat.set(ATLAS_CELLS, ATLAS_CELLS)
          ballTex.offset.set(-((n - 1) % ATLAS_CELLS), -Math.floor((n - 1) / ATLAS_CELLS))
          ballTex.anisotropy = 4
          const wm = wMesh.material.clone()
          wm.map = ballTex
          wMesh.material = wm
          disposables.push(ballTex, wm)
        }

        // live displays: a canvas laid on each screen glass
        root.updateMatrixWorld(true)
        for (const [k, nodeName] of [['entries', 'Display_Entries_Screen'], ['winner', 'Display_Winner_Screen']]) {
          const node = root.getObjectByName(nodeName)
          if (!node) continue
          const box = new THREE.Box3().setFromObject(node)
          const size = box.getSize(new THREE.Vector3())
          const c = document.createElement('canvas')
          c.width = 512
          c.height = Math.round((512 * size.y) / size.x)
          const tex = new THREE.CanvasTexture(c)
          tex.colorSpace = THREE.SRGBColorSpace
          tex.anisotropy = 4
          const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
          const plane = new THREE.Mesh(new THREE.PlaneGeometry(size.x * 0.94, size.y * 0.9), mat)
          plane.position.set((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.max.z + 0.0015)
          machine.add(plane)
          screens[k] = { canvas: c, tex }
          disposables.push(tex, mat, plane.geometry)
        }

        if (gltf.animations[0]) {
          mixer = new THREE.AnimationMixer(root)
          const action = mixer.clipAction(gltf.animations[0])
          action.setLoop(THREE.LoopOnce, 1)
          action.clampWhenFinished = true
          action.play()
          mixer.setTime(1 / FPS)
        }

        // frame the machine
        const box = new THREE.Box3().setFromObject(root)
        box.getCenter(frameCenter)
        box.getSize(frameSize)
        resize()
        for (const l of [key, fill, rim, rim2, top]) l.target.position.copy(frameCenter)
        const stage = buildStage(box, renderer)
        machine.add(stage.group)
        disposables.push(stage)
        // the plinth lifts nothing: it sits under the machine's feet, so include it in the frame
        const below = box.min.y - stage.floorY + frameSize.y * 0.05 // the plinth's front edge in view
        frameSize.y += below
        frameCenter.y -= below / 2
        resize()

        await Promise.all([fontReady(), loadTgnMark().catch(() => null)])
        if (disposed) return
        applyNames()
        ballShown = undefined
        lastScreenKey = ''
        repaintScreens(1)
        setStatus('ready')
        onReadyRef.current?.()
      })
      .catch((e) => {
        console.error(e)
        setStatus('unsupported')
      })

    let visible = true
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
    })
    io.observe(host)

    // click a ball to see it up close
    const canvas = renderer.domElement
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const ballAt = (e) => {
      if (!inspectRef.current || !ballMeshes.length) return null
      const rect = canvas.getBoundingClientRect()
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(ballMeshes.map((b) => b.mesh), false)[0]
      return hit ? ballMeshes.find((b) => b.mesh === hit.object) : null
    }
    const onMove = (e) => {
      if (e.pointerType !== 'mouse') return
      canvas.style.cursor = ballAt(e) ? 'pointer' : ''
    }
    const onClick = (e) => {
      const b = ballAt(e)
      if (!b) return
      const f = mode === 'draw' ? F_DRAW_START + (clock.getElapsedTime() - drawStart) * FPS : F_END
      if (b.n === ballOwn && winnerShown(f)) {
        const info = ballNames.find((x) => ballName(x) === name)
        setPicked({ name: name || `#${number}`, number, tickets: info?.tickets, share: info?.share, winner: true })
        return
      }
      const own = ballNames[b.n - 1]
      setPicked(ballName(own) ? { name: ballName(own), tickets: own?.tickets, share: own?.share } : { name: String(b.n), ball: true })
    }
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('click', onClick)

    const look = new THREE.Vector3()
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host
      if (!w || !h) return
      renderer.setSize(w, h, false)
      composer.setSize(w, h)
      camera.aspect = w / h
      const tall = w / h < 1
      // straight front view, a little above
      const fit = Math.max((frameSize.x * 1.3) / (w / h), frameSize.y * (tall ? 1.16 : 1.1))
      look.copy(frameCenter).setY(frameCenter.y + frameSize.y * 0.03)
      const dist = fit / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
      const dir = new THREE.Vector3(0, 0.16, 1).normalize()
      camera.position.copy(look).addScaledVector(dir, dist)
      camera.lookAt(look)
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host)
    resize()

    let frame = 0
    const render = () => {
      frame = requestAnimationFrame(render)
      if (!visible) return
      const now = clock.getElapsedTime()
      let f = 1
      if (mode === 'idle') {
        // ping-pong through the idle stretch so it loops without a jump
        const span = F_IDLE_END - 1
        const p = (now * FPS) % (2 * span)
        f = reduceMotion ? 1 : 1 + (p < span ? p : 2 * span - p)
      } else if (mode === 'draw') {
        f = F_DRAW_START + (now - drawStart) * FPS
        if (f >= F_END) {
          f = F_END
          mode = 'result'
          const r = drawRun
          drawRun = null
          r?.resolve()
        }
      } else f = F_END
      if (mixer) mixer.setTime(Math.min(f / FPS, F_END / FPS - 1e-4)) // the clip ends exactly at F_END
      const glow = mode === 'result' ? 0.5 : glowAt(f)
      for (const { m, base } of ledMats) m.emissiveIntensity = base * (0.35 + 0.75 * glow)
      const warm = mode === 'result' ? 1 : mode === 'draw' ? warmAt(f) : 0
      for (const m of warmMats) m.emissiveIntensity = 0.75 * warm
      podLight.intensity = 0.18 * warm
      chamberLight.intensity = 0.25 + 0.7 * glow
      repaintBall(f)
      repaintScreens(f)
      composer.render()
    }
    render()

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      io.disconnect()
      ro.disconnect()
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('click', onClick)
      drawRun?.resolve()
      disposables.forEach((d) => d?.dispose?.())
      composer.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      api.current = null
    }
  }, [])

  return (
    <div className={`raffle-machine raffle-machine--${status}`}>
      <div className="raffle-machine__stage" ref={hostRef} />
      {status === 'loading' && <span className="raffle-machine__loading" aria-hidden="true" />}
      {status === 'unsupported' && <span className="raffle-machine__fallback">3D view unavailable</span>}
      {picked && createPortal(<BallViewer ball={picked} onClose={() => setPicked(null)} />, document.body)}
    </div>
  )
})

export default BubbleMachine
