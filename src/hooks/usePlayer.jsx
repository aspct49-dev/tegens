import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { config } from '../config'
import { useAuth } from './useAuth'

// The Rainbet affiliate API rejects ranges longer than ~4 months, so lifetime
// wager is summed over consecutive windows of at most 120 days.
const WINDOW_DAYS = 120
const STORAGE_KEY = 'tegens.player'
// '1' when the saved username came from the signed-in account's approved Rainbet
// link (not typed into "Track your rank"), so it can be cleared when that link goes.
const FROM_ACCOUNT_KEY = 'tegens.player.fromAccount'
// Closed windows never change; the open one (ending today) is re-read after this.
const OPEN_WINDOW_TTL = 5 * 60_000

const iso = (d) => d.toISOString().slice(0, 10)
const DAY = 86_400_000

function windows(sinceIso) {
  const out = []
  const today = new Date(`${iso(new Date())}T00:00:00Z`)
  let start = new Date(`${sinceIso}T00:00:00Z`)
  while (start <= today) {
    const end = new Date(Math.min(start.getTime() + (WINDOW_DAYS - 1) * DAY, today.getTime()))
    out.push({ start: iso(start), end: iso(end), open: end.getTime() === today.getTime() })
    start = new Date(end.getTime() + DAY)
  }
  return out
}

const cache = new Map() // `${start}_${end}` -> { at, rows }

async function loadWindow(w) {
  const key = `${w.start}_${w.end}`
  const hit = cache.get(key)
  // A window fetched while it was still open may be missing its last hours,
  // so it keeps expiring until it has been read again after it closed.
  if (hit && (!hit.open || Date.now() - hit.at < OPEN_WINDOW_TTL)) return hit.rows
  const res = await fetch(`/api/affiliates?start_at=${w.start}&end_at=${w.end}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const rows = (data.affiliates || []).map((a) => ({
    name: String(a.username || ''),
    wagered: parseFloat(a.wagered_amount) || 0,
  }))
  cache.set(key, { at: Date.now(), rows, open: w.open })
  return rows
}

// Sum a username's wager under the code since config.milestones.trackSince.
// Usernames match case-insensitively; `name` is returned as Rainbet spells it.
export async function lookupPlayer(username) {
  const wanted = username.trim().toLowerCase()
  const parts = await Promise.all(windows(config.milestones.trackSince).map(loadWindow))
  let wagered = 0
  let name = null
  for (const rows of parts) {
    for (const r of rows) {
      if (r.name.toLowerCase() === wanted) {
        wagered += r.wagered
        name = r.name
      }
    }
  }
  return { found: name !== null, name: name || username.trim(), wagered }
}

const readSaved = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) || ''
  } catch {
    return ''
  }
}
const writeSaved = (v) => {
  try {
    if (v) localStorage.setItem(STORAGE_KEY, v)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* private mode: the session still works, it just won't be remembered */
  }
}

const readFromAccount = () => {
  try {
    return localStorage.getItem(FROM_ACCOUNT_KEY) === '1'
  } catch {
    return false
  }
}
const writeFromAccount = (on) => {
  try {
    if (on) localStorage.setItem(FROM_ACCOUNT_KEY, '1')
    else localStorage.removeItem(FROM_ACCOUNT_KEY)
  } catch {
    /* private mode */
  }
}

const PlayerContext = createContext(null)

export function PlayerProvider({ children }) {
  const [username, setUsername] = useState(readSaved)
  const [state, setState] = useState({ status: username ? 'loading' : 'idle', wagered: 0, error: null })
  const [tick, setTick] = useState(0)
  // Set by signIn, which has just loaded this username: skip one reload.
  const justResolved = useRef(null)

  useEffect(() => {
    if (!username) {
      setState({ status: 'idle', wagered: 0, error: null })
      return
    }
    if (justResolved.current === username) {
      justResolved.current = null
      return
    }
    let cancelled = false
    setState((s) => ({ ...s, status: 'loading', error: null }))
    lookupPlayer(username).then(
      (r) => !cancelled && setState({ status: 'ready', wagered: r.wagered, error: null }),
      (e) => !cancelled && setState((s) => ({ ...s, status: 'error', error: e.message })),
    )
    return () => {
      cancelled = true
    }
  }, [username, tick])

  // Validates first, so a typo never replaces a working username.
  const signIn = useCallback(async (raw) => {
    const r = await lookupPlayer(raw)
    if (r.found) {
      writeSaved(r.name)
      writeFromAccount(false) // typed in by hand: theirs to keep
      justResolved.current = r.name
      setUsername(r.name)
      setState({ status: 'ready', wagered: r.wagered, error: null })
    }
    return r
  }, [])

  const signOut = useCallback(() => {
    writeSaved('')
    writeFromAccount(false)
    setUsername('')
  }, [])

  // Follow the account's approved Rainbet link (GET /api/auth/me).
  // Signed in: the card shows the approved link and nothing else, so a name saved
  //   earlier (typed in, or a link that was later removed) is cleared when there's no link.
  // Signed out: only a name the account set is cleared; one typed into "Track your rank" stays.
  const auth = useAuth()
  const current = useRef(username)
  current.current = username
  useEffect(() => {
    if (auth.status !== 'ready' || auth.rainbet === undefined) return
    const linked = auth.user ? auth.rainbet : null
    if (linked) {
      writeFromAccount(true)
      if (linked !== current.current) {
        writeSaved(linked)
        setUsername(linked)
      }
    } else if (auth.user || readFromAccount()) {
      writeFromAccount(false)
      writeSaved('')
      setUsername('')
    }
  }, [auth.status, auth.user?.id, auth.rainbet]) // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  const value = useMemo(
    () => ({
      username,
      ...state,
      known: Boolean(username) && state.status === 'ready',
      // signed in: the name comes from the account's approved link, set on the profile
      accountManaged: Boolean(auth.user),
      signIn,
      signOut,
      refresh,
    }),
    [username, state, signIn, signOut, refresh, auth.user],
  )
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}

export const usePlayer = () => useContext(PlayerContext)
