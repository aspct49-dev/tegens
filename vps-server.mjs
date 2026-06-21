// vps-server.mjs
// Tiny same-origin API proxy for self-hosting on a VPS (the non-Vercel path).
// Mirrors api/affiliates.js: it injects RAINBET_API_KEY server-side so the key
// never reaches the browser. Nginx serves the static dist/ and reverse-proxies
// /api/* to this process (listening on localhost only).
//
//   pm2 start vps-server.mjs --name tegens-api
import http from 'node:http'

// Load .env from the current working directory (Node >= 20.12). Harmless if the
// variables are already provided by the environment / PM2.
try { process.loadEnvFile() } catch { /* env provided another way */ }

const PORT = process.env.PORT || 3001
const KEY = process.env.RAINBET_API_KEY

const server = http.createServer(async (req, res) => {
  const json = (status, obj) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(obj))
  }

  const { pathname, searchParams } = new URL(req.url, 'http://localhost')
  if (pathname !== '/api/affiliates') return json(404, { error: 'Not found' })
  if (!KEY) return json(500, { error: 'Missing RAINBET_API_KEY env var' })

  const start = encodeURIComponent(searchParams.get('start_at') || '')
  const end = encodeURIComponent(searchParams.get('end_at') || '')
  const upstream =
    `https://services.rainbet.com/v1/external/affiliates` +
    `?start_at=${start}&end_at=${end}&key=${encodeURIComponent(KEY)}`

  try {
    const upstreamRes = await fetch(upstream)
    const body = await upstreamRes.text()
    res.writeHead(upstreamRes.status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=30, stale-while-revalidate=300',
    })
    res.end(body)
  } catch {
    json(502, { error: 'Failed to reach Rainbet API' })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`TEGENS affiliate proxy listening on http://127.0.0.1:${PORT}`)
})
