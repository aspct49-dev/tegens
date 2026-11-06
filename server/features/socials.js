// Socials & Media page (/socials): the stream, the latest YouTube videos and the
// Discord server, read live and cached so a busy page never hammers the sources.
//
//   GET /api/socials   { kick, youtube, discord, twitter, instagram }
//     kick:    { slug, url, live, viewers, title }       live status from server/kick/chat.js
//     youtube: { handle, url, videos: [{ id, title, url, thumb, published, views }] }   newest first, Shorts left out
//     discord: { url, name, icon, online, members }      online/members null when the invite can't be read
//
// Links and ids live in src/config.js (kickUrl, discordUrl, socials).

import { config } from '../../src/config.js'
import { json } from '../http.js'

const YT_TTL = 15 * 60_000
const DISCORD_TTL = 10 * 60_000
const FAIL_TTL = 2 * 60_000 // after a failed fetch, wait this long before trying again
const MAX_VIDEOS = 8

const cache = { youtube: null, discord: null }

/** Fetch with a timeout; throws on a non-2xx answer */
async function get(url, as = 'text') {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'TEGENS site (socials page)' } })
  if (!res.ok) throw Object.assign(new Error(`${url} answered ${res.status}`), { status: res.status })
  return as === 'json' ? res.json() : res.text()
}

/** Keep the last good value; refetch when it's stale, and back off after a failure */
async function cached(key, ttl, load) {
  const c = cache[key]
  if (c && Date.now() < c.until) return c.value
  try {
    const value = await load()
    cache[key] = { value, until: Date.now() + ttl }
    return value
  } catch (err) {
    console.warn(`[socials] ${key}: ${err.message}`)
    cache[key] = { value: c?.value ?? null, until: Date.now() + FAIL_TTL }
    return cache[key].value
  }
}

// ---------------------------------------------------------------- YouTube (the channel's public feed)

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decode = (s) =>
  String(s ?? '').replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e] ?? m,
  )
const tag = (xml, name) => decode(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(xml)?.[1]?.trim())

export function parseFeed(xml) {
  const videos = []
  for (const [, entry] of String(xml).matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const id = tag(entry, 'yt:videoId')
    const link = /<link rel="alternate" href="([^"]+)"/.exec(entry)?.[1] ?? ''
    if (!/^[\w-]{6,20}$/.test(id ?? '') || link.includes('/shorts/')) continue
    const views = Number(/<media:statistics views="(\d+)"/.exec(entry)?.[1])
    videos.push({
      id,
      title: tag(entry, 'title'),
      url: `https://www.youtube.com/watch?v=${id}`,
      thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      published: tag(entry, 'published') || null,
      views: Number.isFinite(views) ? views : null,
    })
  }
  return videos.slice(0, MAX_VIDEOS)
}

async function youtube() {
  const { handle, channelId } = config.socials?.youtube ?? {}
  const videos = channelId
    ? await cached('youtube', YT_TTL, async () => parseFeed(await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`)))
    : null
  return { handle: handle ?? null, url: handle ? `https://www.youtube.com/@${handle}` : null, videos: videos ?? [] }
}

// ---------------------------------------------------------------- Discord (the invite's public counts)

const inviteCode = (url) => /(?:discord\.gg|discord(?:app)?\.com\/invite)\/([\w-]+)/i.exec(url ?? '')?.[1] ?? null

async function discord() {
  const code = inviteCode(config.discordUrl)
  const info = code
    ? await cached('discord', DISCORD_TTL, async () => {
        const d = await get(`https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=true`, 'json')
        const g = d.guild ?? {}
        return {
          name: g.name ?? null,
          icon: g.id && g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128` : null,
          online: d.approximate_presence_count ?? null,
          members: d.approximate_member_count ?? null,
        }
      })
    : null
  return { url: config.discordUrl, name: info?.name ?? null, icon: info?.icon ?? null, online: info?.online ?? null, members: info?.members ?? null }
}

// ---------------------------------------------------------------- Kick (live status the chat module already polls)

async function kick() {
  const slug = /kick\.com\/([\w-]+)/i.exec(config.kickUrl ?? '')?.[1] ?? null
  const info = await import('../kick/chat.js').then((m) => m.liveInfo?.() ?? null).catch(() => null)
  return { slug, url: config.kickUrl, live: Boolean(info?.live), viewers: info?.viewers ?? null, title: info?.title ?? null }
}

export async function handle(req, ctx) {
  if (ctx.path !== '/api/socials') return null
  if (ctx.method !== 'GET') return json(405, { error: 'Use GET.' })
  const [k, y, d] = await Promise.all([kick(), youtube(), discord()])
  return {
    ...json(200, { kick: k, youtube: y, discord: d, twitter: config.socials?.twitter ?? null, instagram: config.socials?.instagram ?? null }),
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' },
  }
}
