// The contact form (/contact): a visitor's message goes to the admins' Discord channel
// through the same webhook as the admin alerts (.env DISCORD_ADMIN_WEBHOOK, server/notify.js).
// The visitor is told "sent" only after Discord accepted it; otherwise they get an error and
// the Discord server as a fallback. Nothing is stored on the site.
//
//   POST /api/contact { name?, reply, topic, message, website, startedAt }   → { ok: true }
//
// Spam guards: a hidden field people never fill (`website`), a minimum time on the form
// (startedAt, set when the form opened), per-address limits (3 in 10 minutes, 10 a day) and
// a site-wide cap (60 an hour) so the channel can't be flooded.

import { json } from '../http.js'
import { COLORS, deliverToAdmins, notifyEnabled } from '../notify.js'

export const TOPICS = {
  general: 'General question',
  prize: 'A prize, claim or order',
  account: 'My account or my data',
  partner: 'Partnership or business',
  bug: 'Something on the site is broken',
}

const MIN_SECONDS = 3
const PER_IP = [
  [10 * 60, 3],
  [24 * 3600, 10],
]
const SITE_PER_HOUR = 60

const hits = new Map() // ip → [unix seconds]
let site = []

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max)
const EMAIL = /^[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}$/i

/** The reason the message is refused, or '' */
function problem(b) {
  if (clean(b.website, 200)) return 'Your message couldn’t be sent.' // the hidden field: a bot filled it
  const started = Number(b.startedAt)
  const age = Date.now() / 1000 - started
  if (!Number.isFinite(started) || age < MIN_SECONDS || age > 24 * 3600) return 'Please reload the page and try again.'
  const reply = clean(b.reply, 100)
  if (reply.length < 3) return 'Tell us how to reply: an email address, or your Discord or Kick username.'
  if (reply.includes('@') && reply.indexOf('@') > 0 && !EMAIL.test(reply)) return 'That email address doesn’t look right.'
  if (!TOPICS[b.topic]) return 'Pick what your message is about.'
  const message = clean(b.message, 4000)
  if (message.length < 10) return 'Write a little more in your message (at least 10 characters).'
  if (message.length > 2000) return 'Keep your message under 2,000 characters.'
  if ((message.match(/https?:\/\//gi) ?? []).length > 3) return 'Please include no more than 3 links.'
  if (clean(b.name, 200).length > 60) return 'Keep your name under 60 characters.'
  return ''
}

/** Rate limits; returns an error or '' and records the attempt when allowed */
function limited(ip) {
  const now = Math.floor(Date.now() / 1000)
  site = site.filter((t) => now - t < 3600)
  if (site.length >= SITE_PER_HOUR) return 'The contact form is busy right now. Please try again later, or message us in Discord.'
  const mine = (hits.get(ip) ?? []).filter((t) => now - t < PER_IP.at(-1)[0])
  for (const [window, max] of PER_IP) if (mine.filter((t) => now - t < window).length >= max) return 'You’ve sent a few messages already. Please wait a while before sending another.'
  mine.push(now)
  hits.set(ip, mine)
  site.push(now)
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v.at(-1) > PER_IP.at(-1)[0]) hits.delete(k)
  return ''
}

export async function handle(req, ctx) {
  if (ctx.path !== '/api/contact') return null
  if (ctx.method !== 'POST') return json(405, { error: 'Use POST.' })
  const b = ctx.body ?? {}
  const bad = problem(b)
  if (bad) return json(400, { error: bad })
  if (!notifyEnabled()) return json(503, { error: 'The contact form isn’t available right now. Please message us in Discord instead.' })
  const slow = limited(req.ip || 'unknown')
  if (slow) return json(429, { error: slow })
  const signedIn = ctx.user?.kick?.username ?? ctx.user?.discord?.name ?? ''
  const sent = await deliverToAdmins(req, {
    title: `Contact form: ${TOPICS[b.topic]}`,
    color: COLORS.contact,
    description: clean(b.message, 2000),
    fields: [
      ['Name', clean(b.name, 60)],
      ['Reply to', clean(b.reply, 100)],
      ['Signed in as', signedIn],
    ],
  })
  if (!sent) return json(502, { error: 'Your message couldn’t be delivered. Please try again in a minute, or message us in Discord.' })
  return json(200, { ok: true })
}
