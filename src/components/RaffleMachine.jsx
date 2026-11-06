import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

/*
 * The TGN mechanical raffle machine (public/models/raffle_machine.glb, built in Blender by
 * trophy/raffle-machine/build_raffle_machine.py; hierarchy in that folder's README.md).
 *
 * Four number drums (a player number 0000-9999) turn on their own axles, each carrying the
 * digits 0-9 as real geometry, and the side lever swings on its pivot. Controls, through the
 * component's ref:
 *   startDrumRotation()             idle spin (each drum at its own slow speed)
 *   stopDrumRotation()              every drum eases to the next whole digit and holds
 *   setDrumDigit(drumIndex, digit)  one drum (0 = thousands ... 3 = units) spins on to `digit`
 *                                   and holds; resolves when it has landed
 *   setNumber(n)                    all four drums land on n (zero-padded), left to right
 *   triggerHandleAnimation()        one full pull of the lever; resolves when it is back at
 *                                   rest (calls while it runs get the same promise)
 *   setTicket(name, subtitle?)      redraws the paper ticket (subtitle: the line under the name)
 */

const MODEL_URL = '/models/raffle_machine.glb'
const DRACO_PATH = '/draco/'
const DRUM_NODES = ['Drum_Thousands', 'Drum_Hundreds', 'Drum_Tens', 'Drum_Units']
const STEP = (Math.PI * 2) / 10 // one digit of drum rotation
const IDLE_SPEED = [0.48, 0.71, 0.6, 0.82] // rad/s: slow, and different per drum
const PULL_ANGLE = THREE.MathUtils.degToRad(85) // how far the lever travels

const clamp01 = (t) => Math.min(1, Math.max(0, t))
const easeInCubic = (t) => t * t * t
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeOutBack = (t, s = 0.9) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2)
const mod = (a, n) => ((a % n) + n) % n

// fine horizontal streaks: the brushed finish on the gunmetal and the machined steel
function brushedTexture() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 512
  const g = c.getContext('2d')
  g.fillStyle = 'rgb(128,128,128)'
  g.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 2600; i++) {
    const v = 100 + Math.random() * 60
    g.fillStyle = `rgba(${v},${v},${v},${0.25 + Math.random() * 0.35})`
    g.fillRect(Math.random() * 512 - 128, Math.random() * 512, 80 + Math.random() * 380, 0.6 + Math.random() * 1.1)
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(2, 2)
  return t
}

// the ticket face; v runs from inside the printer (top of the canvas) to the free end
function ticketTexture(name, subtitle = 'TEGENS · MONTHLY WAGER RAFFLE') {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 1024
  const g = c.getContext('2d')
  g.fillStyle = '#f3efe7'
  g.fillRect(0, 0, 512, 1024)
  const top = 330 // the part still inside the printer stays blank
  g.strokeStyle = 'rgba(12,26,43,0.55)'
  g.lineWidth = 3
  g.setLineDash([10, 8])
  g.strokeRect(26, top + 10, 460, 640)
  g.setLineDash([])
  g.fillStyle = '#0c1a2b'
  g.textAlign = 'center'
  g.font = '700 46px "Bahnschrift", "Arial Narrow", sans-serif'
  g.fillText('RAFFLE WINNER', 256, top + 92)
  g.fillStyle = '#1f6fe0'
  g.fillRect(156, top + 116, 200, 4)
  g.fillStyle = '#0c1a2b'
  g.font = '800 64px "Bahnschrift", "Arial Narrow", sans-serif'
  g.fillText(name || '— — —', 256, top + 230)
  g.font = '600 26px "Bahnschrift", sans-serif'
  g.fillStyle = 'rgba(12,26,43,0.6)'
  g.fillText(subtitle, 256, top + 290)
  let x = 120 // barcode
  while (x < 392) {
    const w = 2 + Math.floor(Math.random() * 5)
    g.fillStyle = '#0c1a2b'
    g.fillRect(x, top + 330, w, 90)
    x += w + 2 + Math.floor(Math.random() * 5)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.flipY = false
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
  const r = g.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.45, w * 0.45)
  r.addColorStop(0, 'rgba(31,111,224,0.14)')
  r.addColorStop(1, 'rgba(31,111,224,0)')
  g.fillStyle = r
  g.fillRect(0, 0, w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const RaffleMachine = forwardRef(function RaffleMachine({ onReady }, ref) {
  const hostRef = useRef(null)
  const api = useRef(null)
  const [status, setStatus] = useState('loading')
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  useImperativeHandle(ref, () => ({
    startDrumRotation: () => api.current?.startDrumRotation(),
    stopDrumRotation: () => api.current?.stopDrumRotation() ?? Promise.resolve(),
    setDrumDigit: (i, d) => api.current?.setDrumDigit(i, d) ?? Promise.resolve(),
    setNumber: (n) => api.current?.setNumber(n) ?? Promise.resolve(),
    triggerHandleAnimation: () => api.current?.triggerHandleAnimation() ?? Promise.resolve(),
    setTicket: (name, subtitle) => api.current?.setTicket(name, subtitle),
    isHandleBusy: () => api.current?.isHandleBusy() ?? false,
    debugHandle: () => api.current?.debugHandle(),
  }))

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
    // AgX, like the Blender renders: highlights roll off softly instead of clipping white
    renderer.toneMapping = THREE.AgXToneMapping
    renderer.toneMappingExposure = 0.9
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const backdrop = backdropTexture()
    scene.background = backdrop
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = envTexture
    scene.environmentIntensity = 0.22

    // studio rig: soft warm key, cool fill, two TGN-blue rims for the metal edges
    const key = new THREE.DirectionalLight(0xfff1e2, 1.5)
    key.position.set(3.5, 6, 6)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.bias = -0.0003
    key.shadow.normalBias = 0.02
    key.shadow.radius = 5
    Object.assign(key.shadow.camera, { left: -3, right: 3, top: 4, bottom: -1, near: 1, far: 20 })
    const fill = new THREE.DirectionalLight(0xc9dcff, 0.22)
    fill.position.set(-6, 2.5, 4)
    const rim = new THREE.DirectionalLight(0x5fb6ff, 1.0)
    rim.position.set(-3, 5, -5)
    const rim2 = new THREE.DirectionalLight(0x8fcbff, 0.55)
    rim2.position.set(5, 4, -3)
    for (const l of [key, fill, rim, rim2]) scene.add(l, l.target)
    // a soft light in the printer slot (the drums light themselves evenly: see M_DrumFace,
    // a point light in the display left a hot spot on the middle drum)
    const printerLight = new THREE.PointLight(0xd6ecff, 0.3, 0.9, 1.8)
    scene.add(printerLight)

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80)
    // MSAA target: the canvas's own antialias doesn't apply once bloom renders off-screen
    const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }))
    composer.addPass(new RenderPass(scene, camera))
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), 0.1, 0.25, 0.97)) // a touch of glow on the lights only
    composer.addPass(new OutputPass())

    const machine = new THREE.Group()
    scene.add(machine)
    const brushed = brushedTexture()
    const disposables = [envTexture, pmrem, backdrop, brushed]

    // ---- state
    const drums = [] // { i, node, rest, angle, speed, target, landing }
    let handle = null // { pivot, rest, sign, base, baseRest }
    let handleRun = null // { start, resolve, promise }
    let ticketMat = null
    let indicatorMat = null
    let displayMat = null
    let idle = !reduceMotion
    const frameCenter = new THREE.Vector3(0, 1.3, 0)
    const frameSize = new THREE.Vector3(2.9, 2.7, 1.6)
    const look = new THREE.Vector3()
    const clock = new THREE.Clock()

    // ---- drums
    const startDrumRotation = () => {
      idle = true
      drums.forEach((d) => {
        d.landing?.resolve?.()
        d.landing = null
        d.target = IDLE_SPEED[d.i]
      })
    }
    const landDrum = (d, digit, now) =>
      new Promise((resolve) => {
        d.landing?.resolve?.()
        const want = mod(digit, 10) * STEP
        // always forward, at least 1.5 digits on (3 when it's already spinning)
        let to = d.angle + STEP * (d.speed > 0.2 ? 3 : 1.5)
        to += mod(want - mod(to, Math.PI * 2), Math.PI * 2)
        const dur = reduceMotion ? 0.001 : THREE.MathUtils.clamp((3 * (to - d.angle)) / Math.max(d.speed, 1.0), 0.9, 3.0)
        d.landing = { from: d.angle, to, t0: now, dur, resolve }
        d.target = 0
      })
    const setDrumDigit = (i, digit) => {
      const d = drums[i]
      if (!d) return Promise.resolve()
      return landDrum(d, digit, clock.getElapsedTime())
    }
    // the whole number, drums stopping one after another from the left like a real counter
    const setNumber = (n) => {
      const digits = String(Math.max(0, Math.floor(n)) % 10 ** drums.length).padStart(drums.length, '0')
      return Promise.all(
        drums.map((d, i) => new Promise((r) => setTimeout(r, reduceMotion ? 0 : i * 350)).then(() => setDrumDigit(i, +digits[i]))),
      )
    }
    const stopDrumRotation = () => {
      idle = false
      const now = clock.getElapsedTime()
      return Promise.all(drums.map((d) => landDrum(d, Math.ceil(mod(d.angle, Math.PI * 2) / STEP + 0.6), now)))
    }
    const stepDrums = (now, dt) => {
      for (const d of drums) {
        if (d.landing) {
          const l = d.landing
          const p = clamp01((now - l.t0) / l.dur)
          d.angle = l.from + (l.to - l.from) * easeOutBack(p, 0.7)
          d.speed = 0
          if (p >= 1) {
            d.angle = l.to
            d.landing = null
            l.resolve()
          }
        } else {
          // ease the spin speed toward its target so starts and stops never snap
          if (!idle) d.target = 0
          d.speed += (d.target - d.speed) * Math.min(1, dt * 1.6)
          d.angle += d.speed * dt
        }
        d.node.rotation.x = d.rest + d.angle
      }
    }

    // ---- handle: rest -> accelerating pull -> mechanical stop with a small kick -> pause ->
    // weighted return with a tiny settle. Times in seconds.
    const T_PULL = 0.62
    const T_HOLD = 0.38
    const T_RETURN = 0.95
    const T_SETTLE = 0.45
    const T_TOTAL = T_PULL + T_HOLD + T_RETURN + T_SETTLE
    const triggerHandleAnimation = () => {
      if (!handle) return Promise.resolve()
      if (handleRun) return handleRun.promise
      let resolve
      const promise = new Promise((r) => (resolve = r))
      handleRun = { start: clock.getElapsedTime(), resolve, promise }
      if (reduceMotion) {
        handleRun = null
        resolve()
      }
      return promise
    }
    const handleAngle = (k) => {
      if (k < T_PULL) return PULL_ANGLE * easeInCubic(k / T_PULL) // accelerates into the stop
      k -= T_PULL
      // hits the stop: a short damped rebound
      if (k < T_HOLD) return PULL_ANGLE - THREE.MathUtils.degToRad(4) * Math.exp(-k * 14) * Math.sin(k * 42)
      k -= T_HOLD
      if (k < T_RETURN) return PULL_ANGLE * (1 - easeInOutCubic(k / T_RETURN))
      k -= T_RETURN
      return -THREE.MathUtils.degToRad(2.5) * Math.exp(-k * 9) * Math.sin(k * 26) // settles at rest
    }
    const stepHandle = (now) => {
      if (!handle) return
      let a = 0
      let shake = 0
      if (handleRun) {
        const k = now - handleRun.start
        a = handleAngle(k)
        const sinceStop = k - T_PULL
        if (sinceStop > 0 && sinceStop < 0.35) shake = Math.exp(-sinceStop * 12) * Math.sin(sinceStop * 90) * 0.004
        if (k >= T_TOTAL) {
          a = 0
          const r = handleRun
          handleRun = null
          r.resolve()
        }
      }
      handle.pivot.rotation.x = handle.rest + handle.sign * a
      // the mounting and the whole machine take a little of the hit
      if (handle.base) handle.base.rotation.x = handle.baseRest + shake * 2
      machine.position.y = shake * 0.4
      if (indicatorMat) indicatorMat.emissiveIntensity = handleRun ? 1.6 + 1.2 * Math.abs(Math.sin(now * 18)) : 0.9 + 0.2 * Math.sin(now * 2.2)
    }

    // ---- ticket
    const setTicket = (name, subtitle) => {
      if (!ticketMat) return
      ticketMat.map?.dispose()
      ticketMat.map = ticketTexture(name, subtitle)
      ticketMat.needsUpdate = true
    }

    api.current = {
      startDrumRotation,
      stopDrumRotation,
      setDrumDigit,
      setNumber,
      triggerHandleAnimation,
      setTicket,
      isHandleBusy: () => !!handleRun,
      // dev only: the lever's current pull angle (degrees) and its grip position, for testing
      debugHandle: () =>
        handle && {
          deg: THREE.MathUtils.radToDeg((handle.pivot.rotation.x - handle.rest) * handle.sign),
          grip: handle.pivot.getObjectByName('Handle_Grip')?.getWorldPosition(new THREE.Vector3()).toArray().map((n) => +n.toFixed(2)),
        },
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
        ...extra,
      })
      p.name = m.name
      m.dispose()
      return p
    }
    const materialFor = (m) => {
      switch (m.name) {
        case 'M_Gunmetal':
        case 'M_GunmetalDark':
          return physical(m, { roughnessMap: brushed, roughness: m.name === 'M_Gunmetal' ? 0.5 : 0.56, anisotropy: 0.45, clearcoat: 0.15, clearcoatRoughness: 0.4, envMapIntensity: 0.9 })
        case 'M_Steel':
          return physical(m, { roughness: 0.22, envMapIntensity: 0.95 })
        case 'M_SteelDark':
          return physical(m, { roughnessMap: brushed, roughness: 0.42, anisotropy: 0.5, envMapIntensity: 0.9 })
        case 'M_TGNBlue':
          return physical(m, { metalness: 0.75, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.15, envMapIntensity: 0.9 })
        case 'M_DrumFace':
          return physical(m, { metalness: 0.1, roughness: 0.58, emissive: 0xdbe6f2, emissiveIntensity: 0.16, envMapIntensity: 0.35 })
        case 'M_Glass':
          return physical(m, { color: 0xeaf4ff, metalness: 0, roughness: 0.08, transparent: true, opacity: 0.04, depthWrite: false, envMapIntensity: 0.25 })
        case 'M_Ticket':
          return physical(m, { map: ticketTexture(), roughness: 0.82, metalness: 0, sheen: 0.4, sheenRoughness: 0.8, side: THREE.DoubleSide })
        case 'M_LogoEngraved':
          return physical(m, { color: 0xb9c9da, metalness: 0.55, roughness: 0.32, emissive: 0x9fb6cc, emissiveIntensity: 0.12, envMapIntensity: 1.0, alphaTest: 0.45, transparent: false })
        default:
          return m
      }
    }

    // ---- load
    let disposed = false
    const draco = new DRACOLoader().setDecoderPath(DRACO_PATH)
    disposables.push(draco)
    new GLTFLoader()
      .setDRACOLoader(draco)
      .loadAsync(MODEL_URL)
      .then((gltf) => {
        if (disposed) return
        machine.add(gltf.scene)
        gltf.scene.updateMatrixWorld(true)
        const swapped = new Map()
        let printerStrip = null
        gltf.scene.traverse((o) => {
          if (!o.isMesh) return
          o.castShadow = true
          o.receiveShadow = true
          const m = o.material
          if (!swapped.has(m)) swapped.set(m, materialFor(m))
          o.material = swapped.get(m)
          if (o.material.name === 'M_Glass') {
            o.castShadow = false
            o.renderOrder = 2
          }
          if (o.material.name === 'M_Ticket') ticketMat = o.material
          if (o.material.name === 'M_Indicator') indicatorMat = o.material
          if (o.material.name === 'M_DisplayLight') displayMat = o.material
          if (o.name === 'Printer_Light') printerStrip = o
          disposables.push(o.geometry)
        })
        swapped.forEach((mm) => disposables.push(mm))

        DRUM_NODES.forEach((n, i) => {
          const node = gltf.scene.getObjectByName(n)
          if (!node) return
          const spin = reduceMotion ? 0 : IDLE_SPEED[i]
          drums.push({ i, node, rest: node.rotation.x, angle: 0, speed: spin, target: spin, landing: null })
        })
        const pivot = gltf.scene.getObjectByName('Handle_Pivot')
        const grip = gltf.scene.getObjectByName('Handle_Grip')
        if (pivot && grip) {
          // which way is "pull"? the grip must come toward the viewer (+Z) and down
          const rest = pivot.rotation.x
          const at = (a) => {
            pivot.rotation.x = rest + a
            pivot.updateMatrixWorld(true)
            return grip.getWorldPosition(new THREE.Vector3())
          }
          const sign = at(0.4).z > at(0).z ? 1 : -1
          pivot.rotation.x = rest
          const base = gltf.scene.getObjectByName('Handle_Base')
          handle = { pivot, rest, sign, base, baseRest: base?.rotation.x ?? 0 }
        }
        const v = new THREE.Vector3()
        if (printerStrip) printerLight.position.copy(printerStrip.getWorldPosition(v)).add(new THREE.Vector3(0, -0.06, 0.1))

        // frame the machine at rest (with the lever up)
        const box = new THREE.Box3().setFromObject(gltf.scene)
        box.getCenter(frameCenter)
        box.getSize(frameSize)
        frameCenter.z = 0
        resize()
        for (const l of [key, fill, rim, rim2]) l.target.position.copy(frameCenter)
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.ShadowMaterial({ opacity: 0.45 }))
        floor.rotation.x = -Math.PI / 2
        floor.receiveShadow = true
        machine.add(floor)
        disposables.push(floor.geometry, floor.material)
        setStatus('ready')
        onReadyRef.current?.()
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
      // straight front view, a little above so the top housing reads
      const tall = w / h < 1
      const fit = Math.max((frameSize.x * 1.22) / (w / h), frameSize.y * (tall ? 1.28 : 1.2))
      look.copy(frameCenter).setY(frameCenter.y + frameSize.y * (tall ? 0.03 : -0.01))
      const dist = fit / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
      const dir = new THREE.Vector3(0, 0.1, 1).normalize()
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
      stepDrums(now, dt)
      stepHandle(now)
      if (displayMat) displayMat.emissiveIntensity = 0.9 + 0.1 * Math.sin(now * 1.3)
      composer.render()
    }
    render()

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      io.disconnect()
      ro.disconnect()
      handleRun?.resolve()
      drums.forEach((d) => d.landing?.resolve?.())
      ticketMat?.map?.dispose()
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
    </div>
  )
})

export default RaffleMachine
