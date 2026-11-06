// What search engines and link previews see (server/index.js uses it for every page):
//
//   robots.txt / sitemap.xml   built from src/seo.js, with SITE_URL as the base
//   redirectFor(path)          301 targets: /index.html → /, a trailing slash, a known page in the wrong case
//   pageHtml(template, path)   dist/index.html with this page's <title>, description, canonical,
//                              Open Graph / Twitter tags and JSON-LD written in, plus plain HTML
//                              content (the H1, a summary and links) inside #root for crawlers
//                              that don't run JavaScript. React replaces it when the app starts.
//                              Unknown paths get status 404; /admin, /profile and /overlay/* noindex.
//
// .env (all optional):
//   SITE_URL                   the public origin, e.g. https://tegens.bet (default: src/seo.js)
//   GOOGLE_SITE_VERIFICATION   the content of Search Console's HTML-tag verification
//   GA_MEASUREMENT_ID          a GA4 ID (G-XXXXXXX); the browser loads it only after consent

import { config } from '../src/config.js'
import { DEFAULT_SITE_URL, NOT_FOUND, OG_IMAGE, PAGES, PRIVATE, SAME_AS, SITE_NAME, isPrivate, seoFor } from '../src/seo.js'
import { envValue } from './env.js'

export const siteUrl = () => (String(envValue('SITE_URL') || '').trim() || DEFAULT_SITE_URL).replace(/\/+$/, '')

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const ldJson = (v) => `<script type="application/ld+json">${JSON.stringify(v).replace(/</g, '\\u003c')}</script>`
const absolute = (p) => `${siteUrl()}${p === '/' ? '/' : p}`

export function robotsTxt() {
  return [
    'User-agent: *',
    'Allow: /',
    // the API and the OBS overlays aren't pages; /admin and /profile stay crawlable so
    // their noindex is seen (robots.txt is not access control: they check sign-in)
    'Disallow: /api/',
    'Disallow: /overlay/',
    '',
    `Sitemap: ${siteUrl()}/sitemap.xml`,
    '',
  ].join('\n')
}

export function sitemapXml() {
  const urls = PAGES.map((p) => `  <url><loc>${esc(absolute(p.path))}</loc></url>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

const KNOWN = new Set([...PAGES.map((p) => p.path), ...PRIVATE.map((p) => p.path)])

/** Where a permanent redirect should send this path, or null */
export function redirectFor(pathname) {
  if (pathname === '/index.html') return '/'
  if (pathname.startsWith('/api/') || pathname.startsWith('/assets/')) return null
  let p = pathname
  if (p.length > 1 && p.endsWith('/')) p = p.replace(/\/+$/, '') || '/'
  if (!KNOWN.has(p) && KNOWN.has(p.toLowerCase())) p = p.toLowerCase()
  return p !== pathname ? p : null
}

function structuredData(page) {
  const site = siteUrl()
  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${site}/#organization`,
    name: SITE_NAME,
    url: `${site}/`,
    logo: `${site}/assets/tgn-logo.png`,
    sameAs: SAME_AS,
  }
  const website = { '@context': 'https://schema.org', '@type': 'WebSite', '@id': `${site}/#website`, name: SITE_NAME, url: `${site}/`, publisher: { '@id': `${site}/#organization` } }
  const out = [org, website]
  if (page.path !== '/')
    out.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${site}/` },
        { '@type': 'ListItem', position: 2, name: page.label ?? page.h1, item: absolute(page.path) },
      ],
    })
  return out.map(ldJson).join('')
}

function headTags(page, { indexable, canonical }) {
  const image = `${siteUrl()}${OG_IMAGE.path}`
  const verify = String(envValue('GOOGLE_SITE_VERIFICATION') || '').trim()
  const ga = String(envValue('GA_MEASUREMENT_ID') || '').trim()
  const tags = [
    // the canonical origin, for src/meta.js when the app moves to another page
    `<meta name="tg:site" content="${esc(siteUrl())}" />`,
    `<meta name="robots" content="${indexable ? 'index, follow' : 'noindex, nofollow'}" />`,
    canonical ? `<link rel="canonical" href="${esc(canonical)}" />` : '',
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(SITE_NAME)}" />`,
    `<meta property="og:locale" content="en_US" />`,
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    canonical ? `<meta property="og:url" content="${esc(canonical)}" />` : '',
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:width" content="${OG_IMAGE.width}" />`,
    `<meta property="og:image:height" content="${OG_IMAGE.height}" />`,
    `<meta property="og:image:alt" content="${esc(OG_IMAGE.alt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:site" content="@${esc(config.socials.twitter)}" />`,
    `<meta name="twitter:title" content="${esc(page.title)}" />`,
    `<meta name="twitter:description" content="${esc(page.description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
    verify && /^[\w-]{10,100}$/.test(verify) ? `<meta name="google-site-verification" content="${esc(verify)}" />` : '',
    // read by src/analytics.js; nothing loads from Google until the visitor agrees
    /^G-[A-Z0-9]{4,20}$/.test(ga) ? `<meta name="tg:ga" content="${esc(ga)}" />` : '',
    indexable ? structuredData(page) : '',
    // the fallback below is for crawlers without JavaScript; with it, the app draws the page
    `<script>document.documentElement.classList.add('js')</script>`,
    `<style>.js .seo-fallback{display:none}.seo-fallback{max-width:760px;margin:0 auto;padding:96px 20px;font-family:Rubik,system-ui,sans-serif;color:#b9c1d0}.seo-fallback h1{font-size:34px;color:#fff}.seo-fallback a{color:#4db8ff}.seo-fallback ul{display:flex;flex-wrap:wrap;gap:6px 18px;padding:0;list-style:none}</style>`,
  ]
  return tags.filter(Boolean).join('\n    ')
}

function fallbackBody(page, notFound) {
  const links = PAGES.map((p) => `<li><a href="${esc(p.path)}">${esc(p.label)}</a></li>`).join('')
  return (
    `<div class="seo-fallback"><p><a href="/">${esc(SITE_NAME)}</a></p>` +
    `<h1>${esc(page.h1)}</h1><p>${esc(page.description)}</p>` +
    (notFound ? `<p><a href="/">Go to the home page</a></p>` : '') +
    `<nav aria-label="Site"><ul>${links}</ul></nav>` +
    `<p>18+ only. Please gamble responsibly.</p></div>`
  )
}

/** { status, html } for a page request */
export function pageHtml(template, pathname) {
  const page = seoFor(pathname)
  const priv = !page && isPrivate(pathname)
  const notFound = !page && !priv
  const meta = page ?? (priv ? { ...NOT_FOUND, title: PRIVATE.find((p) => p.path === pathname)?.title ?? SITE_NAME, h1: SITE_NAME } : NOT_FOUND)
  let html = template
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(meta.title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(meta.description)}" />`)
    .replace('</head>', `    ${headTags(meta, { indexable: Boolean(page), canonical: page ? absolute(page.path) : null })}\n  </head>`)
  // overlays are OBS browser sources: nothing visible before the app takes over
  if (!pathname.startsWith('/overlay/')) html = html.replace('<div id="root"></div>', `<div id="root">${fallbackBody(meta, notFound)}</div>`)
  return { status: notFound ? 404 : 200, html, noindex: !page }
}
