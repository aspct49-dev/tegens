// The production server for the VPS: one Node process serving the built site
// (dist/) and every /api route. nginx sits in front of it for HTTPS and proxies
// to 127.0.0.1:PORT, passing X-Forwarded-Host / X-Forwarded-Proto.
//
//   npm run build && npm start        (pm2: pm2 start server/index.js --name tegens)
//
// Replaces the old affiliate-only vps-server.mjs.

import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

try {
  process.loadEnvFile()
} catch {
  /* env provided another way (pm2 / systemd) */
}

const { apiMiddleware } = await import('./api.js')
const { startBackground } = await import('./background.js')
const { pageHtml, redirectFor, robotsTxt, sitemapXml } = await import('./seo.js')

const PORT = Number(process.env.PORT) || 3001
const HOST = process.env.HOST || '127.0.0.1'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.glb': 'model/gltf-binary',
  '.wasm': 'application/wasm',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
}

/** A file inside dist/, or null (never anything outside it) */
async function findFile(urlPath) {
  let decoded
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    return null
  }
  const file = path.resolve(ROOT, '.' + decoded)
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return null
  const info = await stat(file).catch(() => null)
  return info?.isFile() ? { file, size: info.size } : null
}

function sendFile(req, res, { file, size }, cache) {
  res.statusCode = 200
  res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream')
  res.setHeader('Content-Length', size)
  res.setHeader('Cache-Control', cache)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (req.method === 'HEAD') return res.end()
  createReadStream(file).pipe(res)
}

/** A small text response (robots.txt, sitemap.xml, the page HTML) */
function sendText(req, res, status, type, body, headers = {}) {
  res.statusCode = status
  res.setHeader('Content-Type', type)
  res.setHeader('Content-Length', Buffer.byteLength(body))
  res.setHeader('X-Content-Type-Options', 'nosniff')
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
  res.end(req.method === 'HEAD' ? undefined : body)
}

// dist/index.html, re-read when a new build replaces it
let template = { mtime: 0, html: '' }
async function indexTemplate() {
  const info = await stat(path.join(ROOT, 'index.html')).catch(() => null)
  if (!info) return null
  if (info.mtimeMs !== template.mtime) template = { mtime: info.mtimeMs, html: await readFile(path.join(ROOT, 'index.html'), 'utf8') }
  return template.html
}

const server = createServer(async (req, res) => {
  const { pathname, search } = new URL(req.url, 'http://localhost')
  if (pathname.startsWith('/api/')) return apiMiddleware(req, res, () => {})
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    return res.end()
  }
  if (pathname === '/robots.txt') return sendText(req, res, 200, 'text/plain; charset=utf-8', robotsTxt(), { 'Cache-Control': 'public, max-age=3600' })
  if (pathname === '/sitemap.xml') return sendText(req, res, 200, 'application/xml; charset=utf-8', sitemapXml(), { 'Cache-Control': 'public, max-age=3600' })
  // permanent redirects: one hop, straight to the page's real address
  const to = redirectFor(pathname)
  if (to) {
    res.statusCode = 301
    res.setHeader('Location', to + search)
    res.setHeader('Cache-Control', 'public, max-age=3600')
    return res.end()
  }
  const hit = pathname !== '/' && (await findFile(pathname))
  // hashed build assets never change; everything else revalidates
  if (hit) return sendFile(req, res, hit, pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=300')
  // a missing file (an image, a script) is a plain 404, not the app
  if (/\.[a-z0-9]{2,5}$/i.test(pathname)) return sendText(req, res, 404, 'text/plain; charset=utf-8', 'Not found')
  // pages (/raffles, /admin, /overlay/…) get the app, with this page's tags; unknown ones a 404
  const html = await indexTemplate()
  if (!html) {
    res.statusCode = 500
    return res.end('dist/ is missing: run npm run build')
  }
  const page = pageHtml(html, pathname)
  sendText(req, res, page.status, 'text/html; charset=utf-8', page.html, {
    'Cache-Control': 'no-cache',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...(page.noindex ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}),
  })
})

server.listen(PORT, HOST, () => {
  console.log(`TEGENS server on http://${HOST}:${PORT}`)
  // the Kick chat socket, the watch-time counter, ... (registered by the feature modules)
  startBackground()
})
