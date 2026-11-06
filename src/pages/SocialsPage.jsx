import { useCallback, useEffect, useRef, useState } from 'react'
import { config } from '../config'
import { PageBackdrop } from '../components/PageHeading'
import '../socials.css'

// Socials & Media (/socials): the Kick stream (the player when live, the
// offline art when not), the latest YouTube videos, the Discord invite and the
// Twitter / Instagram links. Live data comes from GET /api/socials
// (server/features/socials.js); the links work before it answers.

const kickSlug = /kick\.com\/([\w-]+)/i.exec(config.kickUrl)?.[1] ?? ''
const yt = config.socials.youtube
const discordHandle = config.discordUrl.replace(/^https?:\/\/(www\.)?/, '')

const n = (v) => Number(v).toLocaleString('en-US')

function ago(iso) {
  const t = Date.parse(iso ?? '')
  if (!Number.isFinite(t)) return ''
  const s = Math.max(0, (Date.now() - t) / 1000)
  const units = [
    [31536000, 'year'],
    [2592000, 'month'],
    [604800, 'week'],
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
  ]
  for (const [size, name] of units) {
    const v = Math.floor(s / size)
    if (v >= 1) return `Posted ${v} ${name}${v === 1 ? '' : 's'} ago`
  }
  return 'Posted just now'
}

function useSocials() {
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    const load = () =>
      fetch('/api/socials')
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
        .then((d) => live && (setData(d), setFailed(false)))
        .catch(() => live && setFailed(true))
    load()
    const t = setInterval(load, 60_000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [])
  return { data, failed }
}

function SectionHead({ icon, iconW, iconH, title, handle, href, children }) {
  return (
    <div className="so-head">
      <a className="so-head-id" href={href} target="_blank" rel="noopener noreferrer">
        <img className="so-head-ico" src={icon} width={iconW} height={iconH} alt="" />
        <span>
          <span className="so-head-title">{title}</span>
          <span className="so-head-handle">{handle}</span>
        </span>
      </a>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------- Kick

function Stream({ kick }) {
  const live = Boolean(kick?.live)
  return (
    <section className="so-section enter" style={{ '--d': '60ms' }} aria-labelledby="so-kick">
      <SectionHead
        icon="/assets/social/kick.svg"
        iconW="33"
        iconH="37"
        href={config.kickUrl}
        handle={`@${kickSlug}`}
        title={
          <span id="so-kick">
            <span className="grad-silver">Watch us </span>
            <span className="so-grad-kick">Live</span>
            <span className="grad-silver"> Daily</span>
          </span>
        }
      >
        <a className="so-follow" href={config.kickUrl} target="_blank" rel="noopener noreferrer">
          Follow us
        </a>
      </SectionHead>

      <div className={`so-stream${live ? ' is-live' : ''}`}>
        {live ? (
          <iframe
            src={`https://player.kick.com/${kickSlug}?autoplay=true&muted=true`}
            title={kick.title ? `Live on Kick: ${kick.title}` : 'Live on Kick'}
            allow="autoplay; fullscreen; picture-in-picture"
          />
        ) : (
          <a className="so-offline" href={config.kickUrl} target="_blank" rel="noopener noreferrer" aria-label="The stream is offline. Open the channel on Kick">
            <img src="/assets/social/stream-offline.jpg" width="1920" height="1080" alt="" />
          </a>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- YouTube

function VideoCard({ v }) {
  return (
    <article className="so-video">
      <a className="so-video-thumb" href={v.url} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden="true">
        <img src={v.thumb} width="320" height="180" alt="" loading="lazy" />
      </a>
      <h3 className="so-video-title" title={v.title}>
        <a href={v.url} target="_blank" rel="noopener noreferrer">
          {v.title}
        </a>
      </h3>
      <div className="so-video-foot">
        <img className="so-video-ava" src="/assets/social/td-avatar.png" width="24" height="24" alt="" />
        <span className="so-video-meta">
          <span className="so-video-by">Travelling Degens</span>
          <span className="so-video-when">{ago(v.published)}</span>
        </span>
        <a className="so-watch" href={v.url} target="_blank" rel="noopener noreferrer" aria-label={`Watch ${v.title}`}>
          <img src="/assets/social/play.svg" width="11" height="11" alt="" />
          Watch
        </a>
      </div>
    </article>
  )
}

function Videos({ youtube, loading }) {
  const rowRef = useRef(null)
  const [edge, setEdge] = useState({ start: true, end: true })
  const videos = youtube?.videos ?? []
  const channelUrl = youtube?.url ?? `https://www.youtube.com/@${yt.handle}`

  const measure = useCallback(() => {
    const el = rowRef.current
    if (!el) return
    setEdge({ start: el.scrollLeft < 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 })
  }, [])

  useEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure, videos.length])

  const page = (dir) => {
    const el = rowRef.current
    if (el) el.scrollBy({ left: dir * (el.clientWidth - 120), behavior: 'smooth' })
  }

  return (
    <section className="so-section enter" style={{ '--d': '120ms' }} aria-labelledby="so-yt">
      <SectionHead
        icon="/assets/social/youtube.svg"
        iconW="42"
        iconH="29"
        href={channelUrl}
        handle={`@${yt.handle}`}
        title={
          <span id="so-yt">
            <span className="grad-silver">Check out our </span>
            <span className="so-grad-yt">Videos</span>
          </span>
        }
      >
        {videos.length > 0 && (edge.start === false || edge.end === false) && (
          <div className="so-pager">
            <button type="button" className="so-page-btn" onClick={() => page(-1)} disabled={edge.start} aria-label="Earlier videos">
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg>
            </button>
            <button type="button" className="so-page-btn" onClick={() => page(1)} disabled={edge.end} aria-label="More videos">
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
            </button>
          </div>
        )}
      </SectionHead>

      {videos.length > 0 ? (
        <div className={`so-videos${edge.end ? '' : ' fade-end'}${edge.start ? '' : ' fade-start'}`} ref={rowRef} onScroll={measure}>
          {videos.map((v) => (
            <VideoCard key={v.id} v={v} />
          ))}
        </div>
      ) : loading ? (
        <div className="so-videos" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="so-video is-skeleton" />
          ))}
        </div>
      ) : (
        <a className="so-empty" href={channelUrl} target="_blank" rel="noopener noreferrer">
          Watch the latest videos on our YouTube channel
        </a>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- Discord

function Discord({ discord }) {
  const counts = discord?.members != null
  return (
    <section className="so-discord" aria-labelledby="so-dc">
      <img className="so-band-tex" src="/assets/social/band.png" width="1894" height="295" alt="" aria-hidden="true" />
      <div className="so-discord-in enter" style={{ '--d': '180ms' }}>
        <div className="so-discord-main">
          <SectionHead
            icon="/assets/social/discord.svg"
            iconW="36"
            iconH="29"
            href={config.discordUrl}
            handle={discordHandle}
            title={
              <span id="so-dc">
                <span className="grad-silver">Join our </span>
                <span className="so-grad-dc">Discord</span>
                <span className="grad-silver"> Community</span>
              </span>
            }
          />
          <ul className="so-perks">
            {config.socials.discordPerks.map((p) => (
              <li key={p} className="so-perk">
                <span className="so-perk-dot" aria-hidden="true" />
                {p}
              </li>
            ))}
          </ul>
        </div>

        <div className="so-invite">
          <img className="so-invite-ava" src={discord?.icon || '/assets/social/discord-avatar.png'} width="60" height="60" alt="" />
          <p className="so-invite-lead">You’ve been invited to join</p>
          <p className="so-invite-name">TravellingDegens</p>
          {counts && (
            <p className="so-invite-counts">
              {discord.online != null && (
                <span>
                  <span className="so-dot is-on" aria-hidden="true" />
                  {n(discord.online)} Online
                </span>
              )}
              <span>
                <span className="so-dot" aria-hidden="true" />
                {n(discord.members)} Members
              </span>
            </p>
          )}
          <a className="so-accept" href={config.discordUrl} target="_blank" rel="noopener noreferrer">
            Accept Invite
          </a>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- Twitter / Instagram

const FOLLOW = [
  {
    id: 'x',
    name: 'Twitter',
    handle: config.socials.twitter,
    url: `https://x.com/${config.socials.twitter}`,
    icon: '/assets/social/x.svg',
    w: 32,
    h: 29,
    grad: 'so-grad-x',
  },
  {
    id: 'ig',
    name: 'Instagram',
    handle: config.socials.instagram,
    url: `https://www.instagram.com/${config.socials.instagram}/`,
    icon: '/assets/social/instagram.svg',
    w: 29,
    h: 29,
    grad: 'so-grad-ig',
  },
]

function Follow() {
  return (
    <div className="so-follows enter" style={{ '--d': '220ms' }}>
      {FOLLOW.map((f) => (
        <a key={f.id} className="so-follow-card" href={f.url} target="_blank" rel="noopener noreferrer" aria-label={`Follow us on ${f.name}, @${f.handle}`}>
          <img className="so-follow-ico" src={f.icon} width={f.w} height={f.h} alt="" />
          <span className="so-follow-text">
            <span className="so-head-title">
              <span className="grad-silver">Follow us on </span>
              <span className={f.grad}>{f.name}</span>
            </span>
            <span className="so-head-handle">@{f.handle}</span>
          </span>
          <span className="so-follow-btn" aria-hidden="true">
            Click Here
          </span>
        </a>
      ))}
    </div>
  )
}

export default function SocialsPage() {
  const { data, failed } = useSocials()
  return (
    <div className="socials-page">
      <PageBackdrop />
      <h1 className="sr-only">Socials &amp; Media</h1>
      <div className="so-col">
        <Stream kick={data?.kick} />
        <Videos youtube={data?.youtube} loading={!data && !failed} />
      </div>
      <Discord discord={data?.discord} />
      <div className="so-col">
        <Follow />
      </div>
    </div>
  )
}
