// Small helpers shared by every /api handler: cookies, signed values, responses.
// Handlers take a plain request ({ method, url, cookie, host, proto, body,
// headers }) and return a plain response ({ status, headers, body }), so the
// same code runs under the Vite dev server and the VPS server (server/index.js).

import { createHmac, timingSafeEqual } from 'node:crypto'

export function parseCookies(header) {
  const out = {}
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

export function cookie(name, value, maxAgeSeconds, secure) {
  return [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`, secure ? 'Secure' : '']
    .filter(Boolean)
    .join('; ')
}

const sign = (data, secret) => createHmac('sha256', secret).update(data).digest('base64url')

/** base64url(JSON).signature: readable, but any edit breaks the signature */
export function seal(value, secret) {
  const data = Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${data}.${sign(data, secret)}`
}

export function unseal(token, secret) {
  if (!token) return null
  const dot = token.lastIndexOf('.')
  if (dot < 1) return null
  const data = token.slice(0, dot)
  const given = Buffer.from(token.slice(dot + 1))
  const expected = Buffer.from(sign(data, secret))
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    return JSON.parse(Buffer.from(data, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

export const json = (status, body, cookies = []) => ({
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...(cookies.length ? { 'Set-Cookie': cookies } : {}),
  },
  body: JSON.stringify(body),
})

export const redirect = (location, cookies = []) => ({
  status: 302,
  headers: { Location: location, 'Cache-Control': 'no-store', ...(cookies.length ? { 'Set-Cookie': cookies } : {}) },
})

/** The JSON body of a POST, or {} */
export function readJson(req) {
  try {
    const v = JSON.parse(req.body || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

/** The site's public origin: AUTH_URL when set, otherwise from the request */
export function origin(req, authUrl) {
  if (authUrl) return authUrl.replace(/\/+$/, '')
  const host = req.host ?? 'localhost:5191'
  const proto = req.proto?.split(',')[0].trim() || (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

export const nowSeconds = () => Math.floor(Date.now() / 1000)
