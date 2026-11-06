import { useEffect, useRef } from 'react'
import { Link } from '../router'

// Quick links laid over the banner, at the design's x positions (as a share of
// the 1353px banner so they track it when it scales).
const PILLS = [
  { to: '/leaderboard', label: 'LEADERBOARD', icon: 'icon-trophy.svg', w: 18, h: 18, x: 90 },
  { to: '/store', label: 'ITEM STORE', icon: 'icon-store.svg', w: 17.9369, h: 18, x: 305 },
  { to: '/biggest-wins', label: 'BIGGEST WINS', icon: 'nav-wins-active.svg', w: 18, h: 18, x: 919 },
  { to: '/milestones', label: 'MILESTONES', icon: 'icon-gift.svg', w: 16.7441, h: 18, x: 1135 },
]

// `art` = /assets/home/panel-<art>.webp (still) + .mp4 (3 s loop, rendered in
// Blender at 2x the panel size).
const TILES_TOP = [
  { to: '/leaderboard', label: 'LEADERBOARD', art: 'lb' },
  { to: '/store', label: 'ITEM STORE', art: 'store' },
]
const TILES_BOTTOM = [
  { to: '/milestones', label: 'MILESTONES', art: 'ms' },
  { to: '/bonuses', label: 'BONUSES', art: 'refer' }, // the gift-box clip (rendered as panel-refer)
  { to: '/raffles', label: 'RAFFLES', art: 'raffle' },
]

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Hover: the rendered clip (1.8 s) starts and ends on the resting pose, the same frame as
// the still, so:
// - entering plays it and eases the tile up via the registered `--hover` property (550 ms);
// - while the pointer stays, it loops (each pass ends exactly where the next begins);
// - after the pointer leaves, the pass in progress always runs to its end, so the
//   models never stop mid-move; then `--hover` eases back to 0.
function TileArt({ name }) {
  const video = useRef(null)

  useEffect(() => {
    const v = video.current
    const tile = v?.closest('.home-tile')
    if (!v || !tile) return undefined
    let active = 0          // pointer + focus can both hold the tile
    let playing = false

    const enter = () => {
      active += 1
      tile.classList.add('is-hover')
      if (playing || reducedMotion()) return
      playing = true
      v.currentTime = 0
      tile.classList.add('is-playing')
      const p = v.play()
      if (p?.catch) p.catch(() => ended())
    }
    const leave = () => {
      active = Math.max(0, active - 1)
      if (!active && !playing) tile.classList.remove('is-hover')
    }
    const ended = () => {
      v.currentTime = 0
      if (active) {
        // still hovered: go again from the resting frame (seamless, the clip ends where it starts)
        const p = v.play()
        if (p?.catch) p.catch(() => {})
        return
      }
      playing = false
      tile.classList.remove('is-playing')
      v.pause()
      tile.classList.remove('is-hover')
    }
    tile.addEventListener('pointerenter', enter)
    tile.addEventListener('pointerleave', leave)
    tile.addEventListener('focusin', enter)
    tile.addEventListener('focusout', leave)
    v.addEventListener('ended', ended)
    return () => {
      tile.removeEventListener('pointerenter', enter)
      tile.removeEventListener('pointerleave', leave)
      tile.removeEventListener('focusin', enter)
      tile.removeEventListener('focusout', leave)
      v.removeEventListener('ended', ended)
    }
  }, [])

  const src = `/assets/home/panel-${name}`
  const ver = '?v=20261105' // bump when the clips are re-rendered (/assets is cached for a year)
  return (
    <span className="home-tile-art" aria-hidden="true">
      <img className="home-tile-still" src={`${src}.webp${ver}`} alt="" loading="lazy" decoding="async" />
      <video
        ref={video}
        className="home-tile-loop"
        src={`${src}.mp4${ver}`}
        muted
        playsInline
        preload="none"
        disablePictureInPicture
        tabIndex={-1}
      />
    </span>
  )
}

function Tile({ to, label, art, delay }) {
  const content = (
    <>
      {art && <TileArt name={art} />}
      <span className="home-tile-label">{label}</span>
    </>
  )
  const style = { '--d': `${delay}ms` }
  if (!to) {
    return (
      <div className="home-tile is-soon enter" style={style}>
        {content}
      </div>
    )
  }
  return (
    <Link className="home-tile enter" to={to} style={style}>
      {content}
    </Link>
  )
}

export default function HomePage() {
  return (
    <div className="home">
      <h1 className="sr-only">TEGENS: Rainbet rewards, leaderboard and milestones</h1>
      <section className="home-banner enter" style={{ '--d': '0ms' }}>
        <img className="home-banner-img" src="/assets/td/home-banner.webp" width="1353" height="267" alt="TEGENS" fetchpriority="high" />
        {/* the crown and platinum gem float around the TGN logo (they used to sit by the
            leaderboard title); idle float, wiggle on hover */}
        <div className="home-deco crown" aria-hidden="true">
          <img src="/assets/crown.webp" alt="" />
        </div>
        <div className="home-deco platinum" aria-hidden="true">
          <img src="/assets/platinum.png" alt="" />
        </div>
        <nav className="home-pills" aria-label="Quick links">
          {PILLS.map((p, i) => (
            <Link className="home-pill" to={p.to} style={{ left: `${(p.x / 1353) * 100}%` }} key={i}>
              <img src={`/assets/td/${p.icon}`} width={p.w} height={p.h} alt="" />
              {p.label}
            </Link>
          ))}
        </nav>
      </section>

      <div className="home-row home-row-top">
        {TILES_TOP.map((t, i) => (
          <Tile {...t} delay={80 + i * 60} key={t.label} />
        ))}
      </div>
      <div className="home-row home-row-bottom">
        {TILES_BOTTOM.map((t, i) => (
          <Tile {...t} delay={200 + i * 60} key={t.label} />
        ))}
      </div>
    </div>
  )
}
