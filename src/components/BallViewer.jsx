import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import '../ball-viewer.css'
import { drawTgnMark } from '../tgnMark'

/*
 * One raffle ball up close, over the page (opened by clicking a ball in BubbleMachine).
 * The same pearl ball as in the machine, big: the name on the front, TGN on the back, two
 * thin blue rings round it. Drag to turn, scroll / pinch to zoom; it turns slowly until
 * touched. Esc, the backdrop or × closes it.
 *
 * ball: { name, tickets?, share?, number?, winner?, ball? (a numbered ball, no name) }
 */

const FONT = 'Rubik, system-ui, sans-serif'

/** The ball's skin, as an equirectangular map: u 0.25 faces the camera, u 0.75 the back */
function skin(name) {
  const c = document.createElement('canvas')
  c.width = 2048
  c.height = 1024
  const g = c.getContext('2d')
  g.fillStyle = '#f4f1ea'
  g.fillRect(0, 0, c.width, c.height)
  // two thin rings, above and below the name, all the way round
  g.fillStyle = '#1f6fe0'
  g.fillRect(0, 512 - 150, c.width, 9)
  g.fillRect(0, 512 + 141, c.width, 9)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  // the name on the front, as large as fits ~100° of the ball
  g.fillStyle = '#0b1218'
  let size = 190
  for (; size > 60; size -= 6) {
    g.font = `700 ${size}px ${FONT}`
    if (g.measureText(name).width <= 600) break
  }
  let s = name
  while (g.measureText(s).width > 640 && s.length > 2) s = s.slice(0, -1)
  g.fillText(s === name ? name : `${s.slice(0, -1)}…`, 512, 520)
  // the TGN logo on the back (the word in TGN blue if the logo hasn't loaded)
  if (!drawTgnMark(g, 1536, 508, 230)) {
    g.fillStyle = '#1f6fe0'
    g.font = `800 150px ${FONT}`
    if ('letterSpacing' in g) g.letterSpacing = '18px'
    g.fillText('TGN', 1536 + 9, 520)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const share = (v) => `${(v * 100).toLocaleString('en-US', { maximumFractionDigits: v < 0.01 ? 2 : 1 })}%`

export default function BallViewer({ ball, onClose }) {
  const hostRef = useRef(null)
  const closeRef = useRef(null)
  const name = ball.name

  useEffect(() => {
    const before = document.activeElement
    closeRef.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      before?.focus?.()
    }
  }, [onClose])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined
    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      return undefined
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.AgXToneMapping
    renderer.toneMappingExposure = 1.05
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const pmrem = new THREE.PMREMGenerator(renderer)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    scene.environmentIntensity = 0.55
    const key = new THREE.DirectionalLight(0xfff1e2, 2.2)
    key.position.set(-3, 4, 5)
    const rim = new THREE.DirectionalLight(0x4db8ff, 2.4)
    rim.position.set(3, 1.5, -4)
    scene.add(key, rim)

    const map = skin(name)
    map.anisotropy = renderer.capabilities.getMaxAnisotropy()
    const material = new THREE.MeshPhysicalMaterial({ map, roughness: 0.26, clearcoat: 0.9, clearcoatRoughness: 0.05, sheen: 0.3, sheenColor: 0xcfe8ff })
    const geometry = new THREE.SphereGeometry(1, 96, 64)
    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50)
    camera.position.set(0, 0.25, 4.4)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.enablePan = false
    controls.autoRotate = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    controls.autoRotateSpeed = 1.4
    const stopSpin = () => {
      controls.autoRotate = false
    }
    controls.addEventListener('start', stopSpin)

    let fitted = false
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host
      if (!w || !h) return
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      if (fitted) return
      // the whole ball in view with room round it, whichever side is shorter
      fitted = true
      const half = THREE.MathUtils.degToRad(camera.fov / 2)
      const narrow = Math.min(half, Math.atan(Math.tan(half) * camera.aspect))
      const dist = 1.32 / Math.sin(narrow)
      camera.position.setLength(dist)
      controls.minDistance = dist * 0.6
      controls.maxDistance = dist * 1.6
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host)
    resize()

    let frame = 0
    const render = () => {
      frame = requestAnimationFrame(render)
      controls.update()
      renderer.render(scene, camera)
    }
    render()

    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      controls.removeEventListener('start', stopSpin)
      controls.dispose()
      geometry.dispose()
      material.dispose()
      map.dispose()
      env.dispose()
      pmrem.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [name])

  const facts = []
  if (ball.tickets != null) facts.push(`${ball.tickets.toLocaleString('en-US')} ${ball.tickets === 1 ? 'ticket' : 'tickets'}`)
  if (ball.share != null) facts.push(`${share(ball.share)} of the tickets`)
  if (ball.number != null) facts.push(`Player #${String(ball.number).padStart(4, '0')}`)

  return (
    <div className="bv" role="dialog" aria-modal="true" aria-label={ball.ball ? `Ball ${name}` : `${name}'s ball`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bv-stage" ref={hostRef} />
      <div className="bv-card">
        <span className={`bv-kind${ball.winner ? ' is-winner' : ''}`}>{ball.winner ? 'Winner' : ball.ball ? 'Ball' : 'In the draw'}</span>
        <span className="bv-name">{ball.ball ? `No. ${name}` : name}</span>
        {facts.length > 0 && <span className="bv-facts">{facts.join(' · ')}</span>}
        <span className="bv-hint">Drag to turn it, scroll or pinch to zoom</span>
      </div>
      <button ref={closeRef} type="button" className="bv-close" onClick={onClose} aria-label="Close">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
