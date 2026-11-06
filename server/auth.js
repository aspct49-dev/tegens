// Sign in with Kick or Discord, and link the other (ported from King Kulbik).
//
// The session is a signed cookie (server/http.js seal): readable JSON that nobody
// can edit. Accounts live in the players table; new accounts are made with Kick
// (id kick-<Kick user id>) and can link Discord afterwards. Signing in with
// Discord finds an account that already has that Discord.
//
//   GET  /api/auth/me                 → { user, admin, rainbet, rainbetRemoved } rainbet: the account's
//                                       approved Rainbet username, or null (the side nav's rank card
//                                       follows it); rainbetRemoved: the name of a rejected/unlinked link
//   GET  /api/auth/kick/login         → Kick (OAuth 2.1 + PKCE); links Kick when signed in
//   GET  /api/auth/kick/callback
//   GET  /api/auth/discord/login      → Discord; links Discord to a Kick sign-in
//   GET  /api/auth/discord/callback
//   POST /api/auth/logout
//
// Admins: the account's Discord id is in ADMIN_DISCORD_IDS (comma separated),
// checked on every request.

import { createHash, randomBytes } from 'node:crypto'
import { envValue } from './env.js'
import { cookie, json, nowSeconds, origin, parseCookies, redirect, seal, unseal } from './http.js'
import { read, update } from './store.js'

export const SESSION_COOKIE = 'tg_session'
const STATE_COOKIE = 'tg_oauth'
const SESSION_DAYS = 30
const STATE_MINUTES = 10

const DISCORD_AUTHORIZE = 'https://discord.com/oauth2/authorize'
const DISCORD_TOKEN = 'https://discord.com/api/oauth2/token'
const DISCORD_ME = 'https://discord.com/api/users/@me'
const KICK_AUTHORIZE = 'https://id.kick.com/oauth/authorize'
const KICK_TOKEN = 'https://id.kick.com/oauth/token'
const KICK_USERS = 'https://api.kick.com/public/v1/users'
// Kick sits behind Cloudflare, which turns away requests without a browser-like UA
export const KICK_UA = 'Mozilla/5.0'

const secret = () => envValue('SESSION_SECRET')
export const accountId = (user) => user?.id ?? ''
export const displayName = (user) => user?.kick?.username ?? user?.discord?.name ?? 'Player'

/** The signed-in user from the session cookie, or null */
export function readSession(req) {
  const s = secret()
  if (!s || s.length < 32) return null
  const user = unseal(parseCookies(req.cookie)[SESSION_COOKIE], s)
  return user?.id ? user : null
}

/**
 * Admins: a Kick username in ADMIN_KICK_USERNAMES or a Discord id in
 * ADMIN_DISCORD_IDS (comma separated), checked on every request. Both come from a
 * verified OAuth sign-in, so neither can be claimed without that account.
 */
export function isAdmin(user) {
  const list = (name) => envValue(name).split(/[\s,]+/).filter(Boolean)
  const kick = user?.kick?.username?.toLowerCase()
  if (kick && list('ADMIN_KICK_USERNAMES').some((n) => n.toLowerCase() === kick)) return true
  return Boolean(user?.discord && list('ADMIN_DISCORD_IDS').includes(user.discord.id))
}

// ---------------------------------------------------------------- accounts (players table)

/**
 * A player row's Rainbet username when an admin has approved the link, else null.
 * Links saved before approvals existed have no status: they count as approved.
 * (features/players.js owns the link; it's here so both files share one rule.)
 */
export function approvedRainbet(row) {
  const link = row?.rainbet
  return link?.username && (link.status ?? 'approved') === 'approved' ? link.username : null
}

async function findBy(pred) {
  const players = await read('players')
  return players.find(pred) ?? null
}

/** Insert or refresh the profile for a session; returns the session as stored */
async function remember(session) {
  const t = nowSeconds()
  await update('players', (list) => {
    const i = list.findIndex((p) => p.id === session.id)
    const profile = {
      ...(i >= 0 ? list[i] : { firstSeen: t }),
      id: session.id,
      name: displayName(session),
      avatar: session.kick?.avatar ?? session.discord?.avatar ?? null,
      kick: session.kick,
      discord: session.discord,
      lastSeen: t,
    }
    if (i >= 0) list[i] = profile
    else list.push(profile)
    return list
  })
  return session
}

const sessionFromProfile = (p, via) => ({
  id: p.id,
  kick: p.kick ?? null,
  discord: p.discord ?? null,
  signedInAt: nowSeconds(),
  via,
})

// ---------------------------------------------------------------- helpers

const safeReturn = (value, fallback) => (value && value.startsWith('/') && !value.startsWith('//') ? value : fallback)

function failBack(returnTo, message, cookies = []) {
  const url = new URL(returnTo, 'http://x')
  url.searchParams.set('auth_error', message)
  return redirect(url.pathname + url.search, cookies)
}

// ---------------------------------------------------------------- handler

export async function handleAuth(req) {
  const url = new URL(req.url, 'http://localhost')
  if (!url.pathname.startsWith('/api/auth/')) return null
  const s = secret()
  if (!s || s.length < 32) return json(500, { error: 'Sign-in is not configured (SESSION_SECRET).' })

  const base = origin(req, envValue('AUTH_URL'))
  const secure = base.startsWith('https://')
  const cookies = parseCookies(req.cookie)
  const user = readSession(req)
  const clearState = cookie(STATE_COOKIE, '', 0, secure)
  const sessionCookie = (session) => cookie(SESSION_COOKIE, seal(session, s), SESSION_DAYS * 86400, secure)
  const route = url.pathname.slice('/api/auth/'.length)

  // each visit restarts the 30 days, so regulars stay signed in
  if (route === 'me') {
    const row = user ? await findBy((p) => p.id === user.id) : null
    const rainbet = approvedRainbet(row)
    // a link an admin turned down or removed: the browser drops that name if it still shows it
    const rainbetRemoved = !rainbet && ['rejected', 'unlinked'].includes(row?.rainbet?.status) ? row.rainbet.username : null
    const admin = isAdmin(user)
    // mods (server/mods.js) open a smaller admin panel: claims and the stream tools
    const mod = !admin && user ? await (await import('./mods.js')).isMod(user) : false
    return json(200, { user, admin, mod, rainbet, rainbetRemoved }, user ? [sessionCookie(user)] : [])
  }

  if (route === 'logout') {
    if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
    return json(200, { user: null }, [cookie(SESSION_COOKIE, '', 0, secure)])
  }

  // ---- Discord
  if (route === 'discord/login') {
    const id = envValue('DISCORD_CLIENT_ID')
    if (!id || !envValue('DISCORD_CLIENT_SECRET')) return json(500, { error: 'Discord sign-in is not configured.' })
    const state = {
      provider: 'discord',
      state: randomBytes(16).toString('base64url'),
      returnTo: safeReturn(url.searchParams.get('return'), '/'),
      expires: nowSeconds() + STATE_MINUTES * 60,
    }
    const a = new URL(DISCORD_AUTHORIZE)
    a.searchParams.set('client_id', id)
    a.searchParams.set('response_type', 'code')
    a.searchParams.set('redirect_uri', `${base}/api/auth/discord/callback`)
    a.searchParams.set('scope', 'identify')
    a.searchParams.set('state', state.state)
    return redirect(a.toString(), [cookie(STATE_COOKIE, seal(state, s), STATE_MINUTES * 60, secure)])
  }

  if (route === 'discord/callback') {
    const saved = unseal(cookies[STATE_COOKIE], s)
    const returnTo = saved?.returnTo ?? '/'
    if (url.searchParams.get('error')) return failBack(returnTo, 'Discord sign-in was cancelled.', [clearState])
    if (!saved || saved.provider !== 'discord' || saved.expires < nowSeconds() || saved.state !== url.searchParams.get('state'))
      return failBack(returnTo, 'That sign-in link expired. Please try again.', [clearState])
    const code = url.searchParams.get('code')
    if (!code) return failBack(returnTo, 'Discord sign-in failed.', [clearState])
    try {
      const tokenRes = await fetch(DISCORD_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({
          client_id: envValue('DISCORD_CLIENT_ID'),
          client_secret: envValue('DISCORD_CLIENT_SECRET'),
          grant_type: 'authorization_code',
          code,
          redirect_uri: `${base}/api/auth/discord/callback`,
        }),
      })
      const token = await tokenRes.json().catch(() => null)
      if (!tokenRes.ok || !token?.access_token) {
        console.error('[auth] Discord token exchange failed:', tokenRes.status)
        return failBack(returnTo, 'Discord would not sign you in. Please try again.', [clearState])
      }
      const meRes = await fetch(DISCORD_ME, { headers: { Authorization: `Bearer ${token.access_token}` } })
      const me = await meRes.json().catch(() => null)
      if (!meRes.ok || !me?.id) return failBack(returnTo, 'Discord would not say who you are.', [clearState])
      const discord = {
        id: me.id,
        username: me.username,
        name: me.global_name || me.username,
        avatar: me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128` : null,
      }
      const owner = await findBy((p) => p.discord?.id === me.id)
      let session
      if (user) {
        // signed in (with Kick): Discord joins this account
        if (owner && owner.id !== user.id)
          return failBack(returnTo, 'That Discord is already linked to another account here. Ask in the Discord to sort it out.', [clearState])
        session = { ...user, discord }
      } else if (owner) {
        session = { ...sessionFromProfile(owner, 'discord'), discord }
      } else {
        return failBack(returnTo, 'Sign in with Kick first. You can link Discord after.', [clearState])
      }
      await remember(session)
      return redirect(returnTo, [clearState, sessionCookie(session)])
    } catch (err) {
      console.error('[auth] Discord sign-in threw:', err)
      return failBack(returnTo, 'Could not reach Discord. Please try again.', [clearState])
    }
  }

  // ---- Kick
  if (route === 'kick/login') {
    const id = envValue('KICK_CLIENT_ID')
    if (!id || !envValue('KICK_CLIENT_SECRET')) return json(500, { error: 'Kick sign-in is not configured.' })
    if (user?.kick) return redirect(safeReturn(url.searchParams.get('return'), '/'))
    const verifier = randomBytes(48).toString('base64url')
    const state = {
      provider: 'kick',
      state: randomBytes(16).toString('base64url'),
      verifier,
      returnTo: safeReturn(url.searchParams.get('return'), '/'),
      expires: nowSeconds() + STATE_MINUTES * 60,
    }
    const a = new URL(KICK_AUTHORIZE)
    a.searchParams.set('client_id', id)
    a.searchParams.set('response_type', 'code')
    a.searchParams.set('redirect_uri', `${base}/api/auth/kick/callback`)
    a.searchParams.set('scope', 'user:read')
    a.searchParams.set('state', state.state)
    a.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url'))
    a.searchParams.set('code_challenge_method', 'S256')
    return redirect(a.toString(), [cookie(STATE_COOKIE, seal(state, s), STATE_MINUTES * 60, secure)])
  }

  if (route === 'kick/callback') {
    const saved = unseal(cookies[STATE_COOKIE], s)
    const returnTo = saved?.returnTo ?? '/'
    if (url.searchParams.get('error')) return failBack(returnTo, 'Kick sign-in was cancelled.', [clearState])
    if (!saved || saved.provider !== 'kick' || !saved.verifier || saved.expires < nowSeconds() || saved.state !== url.searchParams.get('state'))
      return failBack(returnTo, 'That link expired. Please try again.', [clearState])
    const code = url.searchParams.get('code')
    if (!code) return failBack(returnTo, 'Kick sign-in failed.', [clearState])
    try {
      const tokenRes = await fetch(KICK_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': KICK_UA },
        body: new URLSearchParams({
          client_id: envValue('KICK_CLIENT_ID'),
          client_secret: envValue('KICK_CLIENT_SECRET'),
          grant_type: 'authorization_code',
          code,
          redirect_uri: `${base}/api/auth/kick/callback`,
          code_verifier: saved.verifier,
        }),
      })
      const token = await tokenRes.json().catch(() => null)
      if (!tokenRes.ok || !token?.access_token) {
        console.error('[auth] Kick token exchange failed:', tokenRes.status)
        return failBack(returnTo, 'Kick would not sign you in. Please try again.', [clearState])
      }
      const meRes = await fetch(KICK_USERS, {
        headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/json', 'User-Agent': KICK_UA },
      })
      const body = await meRes.json().catch(() => null)
      const me = Array.isArray(body?.data) ? body.data[0] : body?.data
      if (!meRes.ok || !me?.user_id) return failBack(returnTo, 'Kick would not say who you are.', [clearState])
      const kick = {
        id: String(me.user_id),
        username: me.name ?? `kick-${me.user_id}`,
        avatar: typeof me.profile_picture === 'string' && me.profile_picture.startsWith('https://') ? me.profile_picture : null,
      }
      const owner = await findBy((p) => p.kick?.id === kick.id)
      let session
      if (user) {
        // signed in (with Discord): link Kick to this account
        if (owner && owner.id !== user.id)
          return failBack(returnTo, 'That Kick is linked to another account here. Ask in the Discord to move it.', [clearState])
        session = { ...user, kick }
      } else if (owner) {
        session = { ...sessionFromProfile(owner, 'kick'), kick }
      } else {
        session = { id: `kick-${kick.id}`, kick, discord: null, signedInAt: nowSeconds(), via: 'kick' }
      }
      await remember(session)
      return redirect(returnTo, [clearState, sessionCookie(session)])
    } catch (err) {
      console.error('[auth] Kick sign-in threw:', err)
      return failBack(returnTo, 'Could not reach Kick. Please try again.', [clearState])
    }
  }

  return json(404, { error: 'Not found.' })
}
