import { useEffect, useState } from 'react'

// Who wears the VIP badge (server/features/vips.js, GET /api/events/vip-names):
//   kick     the VIPs' Kick usernames (giveaway winners, chat, the account chip)
//   rainbet  the Rainbet usernames linked (approved) to a VIP's account (leaderboard, wager raffle)
// Loaded once per page view and shared by every badge; refreshed every 5 minutes.

const EMPTY = { kick: new Set(), rainbet: new Set() }
const REFRESH = 5 * 60_000

let current = EMPTY
let loadedAt = 0
let inflight = null
const subscribers = new Set()

function load() {
  if (inflight || Date.now() - loadedAt < REFRESH) return inflight
  inflight = fetch('/api/events/vip-names')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((d) => {
      current = { kick: new Set(d.kick ?? []), rainbet: new Set(d.rainbet ?? []) }
      loadedAt = Date.now()
      subscribers.forEach((fn) => fn(current))
    })
    .catch(() => {
      loadedAt = Date.now() - REFRESH + 30_000 // try again in 30 s
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

/**
 * isVip(name, via): via 'kick' | 'rainbet' | 'any' (default). Names compare case-insensitively.
 */
export function useVips() {
  const [sets, setSets] = useState(current)
  useEffect(() => {
    subscribers.add(setSets)
    load()
    const t = setInterval(load, REFRESH)
    return () => {
      subscribers.delete(setSets)
      clearInterval(t)
    }
  }, [])
  const isVip = (name, via = 'any') => {
    const k = String(name ?? '').trim().toLowerCase()
    if (!k) return false
    if (via === 'kick') return sets.kick.has(k)
    if (via === 'rainbet') return sets.rainbet.has(k)
    return sets.kick.has(k) || sets.rainbet.has(k)
  }
  return { isVip }
}
