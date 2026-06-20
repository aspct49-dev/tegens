// Serverless proxy for the Rainbet affiliate API (Vercel / Netlify-functions style).
// Keeps RAINBET_API_KEY server-side. The browser only ever calls /api/affiliates.
//
// Deploy notes:
//  - Vercel: this file is auto-exposed at /api/affiliates. Set RAINBET_API_KEY in
//    Project Settings → Environment Variables.
//  - Netlify: set publish="dist", functions dir, or use the Vercel adapter.
export default async function handler(req, res) {
  const key = process.env.RAINBET_API_KEY
  if (!key) {
    res.status(500).json({ error: 'Missing RAINBET_API_KEY env var' })
    return
  }

  const startAt = (req.query?.start_at || '').toString()
  const endAt = (req.query?.end_at || '').toString()

  const url =
    `https://services.rainbet.com/v1/external/affiliates` +
    `?start_at=${encodeURIComponent(startAt)}` +
    `&end_at=${encodeURIComponent(endAt)}` +
    `&key=${encodeURIComponent(key)}`

  try {
    const upstream = await fetch(url)
    const data = await upstream.json()
    // cache at the CDN edge for a minute to avoid hammering the API
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
    res.status(upstream.status).json(data)
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach Rainbet API' })
  }
}
