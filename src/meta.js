import { NOT_FOUND, PRIVATE, SITE_NAME, seoFor } from './seo'

// Keeps the head in step with the page on in-app navigation. The server already wrote the
// right tags for the first page (server/seo.js); this updates them when the router moves.

// the canonical origin the server wrote (SITE_URL, server/seo.js); the dev server writes none
const base = (() => {
  try {
    return new URL(document.querySelector('meta[name="tg:site"]')?.getAttribute('content') || window.location.origin).origin
  } catch {
    return window.location.origin
  }
})()

function setMeta(attr, key, value) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', value)
}

function setCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]')
  if (!href) return el?.remove()
  if (!el) {
    el = document.createElement('link')
    el.rel = 'canonical'
    document.head.appendChild(el)
  }
  el.href = href
}

/** The page's title and tags for `path`; returns the title set */
export function applyMeta(path) {
  const page = seoFor(path)
  const priv = PRIVATE.find((p) => p.path === path)
  const meta = page ?? (priv ? { ...NOT_FOUND, title: priv.title } : NOT_FOUND)
  const url = page ? `${base}${page.path === '/' ? '/' : page.path}` : null
  document.title = meta.title
  setMeta('name', 'description', meta.description)
  setMeta('name', 'robots', page ? 'index, follow' : 'noindex, nofollow')
  setMeta('property', 'og:title', meta.title)
  setMeta('property', 'og:description', meta.description)
  setMeta('property', 'og:site_name', SITE_NAME)
  setMeta('name', 'twitter:title', meta.title)
  setMeta('name', 'twitter:description', meta.description)
  if (url) setMeta('property', 'og:url', url)
  setCanonical(url)
  return meta.title
}
