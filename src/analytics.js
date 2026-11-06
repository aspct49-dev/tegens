import { useSyncExternalStore } from 'react'

// Google Analytics 4, only when the server is configured with GA_MEASUREMENT_ID (it writes
// <meta name="tg:ga"> into the page, server/seo.js) AND the visitor has said yes in the
// cookie banner (src/components/ConsentBanner.jsx). Until then nothing is requested from
// Google and no analytics cookie is set. The choice is kept in localStorage
// ('tegens.consent': 'granted' | 'denied') and can be changed from the footer.
//
// Page views: sent by hand on each route change (App.jsx calls trackPage), with
// send_page_view off, so a page counts once. In GA4, turn OFF "Page changes based on
// browser history events" under Enhanced measurement, or SPA moves count twice.

const KEY = 'tegens.consent'
const listeners = new Set()
let loaded = false

export const gaId = () => {
  if (typeof document === 'undefined') return ''
  const id = document.querySelector('meta[name="tg:ga"]')?.getAttribute('content') ?? ''
  return /^G-[A-Z0-9]{4,20}$/.test(id) ? id : ''
}

function read() {
  try {
    return window.localStorage.getItem(KEY)
  } catch {
    return null
  }
}

let choice = typeof window === 'undefined' ? null : read()
let bannerOpen = false

const emit = () => listeners.forEach((l) => l())

function load() {
  const id = gaId()
  if (loaded || !id) return
  loaded = true
  window[`ga-disable-${id}`] = false
  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag() {
    window.dataLayer.push(arguments) // gtag.js needs the arguments object itself
  }
  window.gtag('js', new Date())
  window.gtag('config', id, { send_page_view: false })
  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
  document.head.appendChild(s)
}

/** Remove GA's first-party cookies (_ga, _ga_XXXX) after a "no" */
function clearCookies() {
  const host = window.location.hostname
  const domains = ['', host, `.${host}`, `.${host.split('.').slice(-2).join('.')}`]
  for (const c of document.cookie.split(';')) {
    const name = c.split('=')[0].trim()
    if (!/^_ga/.test(name)) continue
    for (const d of domains) document.cookie = `${name}=; Max-Age=0; path=/${d ? `; domain=${d}` : ''}`
  }
}

export function setConsent(value) {
  choice = value === 'granted' ? 'granted' : 'denied'
  bannerOpen = false
  try {
    window.localStorage.setItem(KEY, choice)
  } catch {
    // private mode: the choice lasts for this visit only
  }
  const id = gaId()
  if (choice === 'granted') {
    load()
    trackPage()
  } else if (id) {
    window[`ga-disable-${id}`] = true
    clearCookies()
  }
  emit()
}

/** Show the banner again (footer "Cookie settings") */
export function reopenConsent() {
  bannerOpen = true
  emit()
}

/** Start GA on page load if the visitor already agreed */
export function initAnalytics() {
  if (choice === 'granted') load()
}

/** One page view for the current address and title */
export function trackPage() {
  if (!loaded || !window.gtag) return
  window.gtag('event', 'page_view', { page_location: window.location.href, page_path: window.location.pathname, page_title: document.title })
}

const snapshot = () => `${choice ?? ''}|${bannerOpen ? 1 : 0}`
const subscribe = (l) => (listeners.add(l), () => listeners.delete(l))

/** { enabled: GA configured, choice, showBanner } */
export function useConsent() {
  useSyncExternalStore(subscribe, snapshot, snapshot)
  const enabled = Boolean(gaId())
  return { enabled, choice, showBanner: enabled && (bannerOpen || !choice) }
}
