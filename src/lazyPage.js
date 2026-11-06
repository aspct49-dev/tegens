import { lazy } from 'react'

// lazy() for pages and admin sections, safe across new versions of the site.
//
// Each build renames the page files (their names carry a content hash) and the old ones are
// gone from the server. A tab opened before the update still asks for the old names when you
// switch pages, the request fails, and React used to drop the whole screen. Now a failed load
// reloads the page once, which fetches the new version, and the visitor lands where they clicked.
// If it fails again right after (really offline, or broken), the error goes to PageError.

const KEY = 'tegens.reloadedForUpdate'
const WINDOW_MS = 15_000

function reloadOnce() {
  let last = 0
  try {
    last = Number(window.sessionStorage.getItem(KEY)) || 0
  } catch {
    // no storage: still allow one reload per page view
  }
  if (Date.now() - last < WINDOW_MS) return false
  try {
    window.sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    // ignore
  }
  window.location.reload()
  return true
}

export function lazyPage(load) {
  return lazy(() =>
    load().catch((err) => {
      if (reloadOnce()) return new Promise(() => {}) // the reload takes over; never settle
      throw err
    }),
  )
}

// Vite raises this when a page's CSS or shared code can't be preloaded (same cause)
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (e) => {
    if (reloadOnce()) e.preventDefault()
  })
}
