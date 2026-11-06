import { config } from './config'

const TIERS = config.milestones.tiers

// Where a lifetime wager sits on the tier ladder.
//   current: highest tier reached (null below the first)
//   next:    the tier being worked towards (null once the top is reached)
//   pct:     0..1 progress from `current` to `next`
export function getProgress(wagered = 0) {
  let reached = -1
  TIERS.forEach((t, i) => {
    if (wagered >= t.wager) reached = i
  })
  const current = TIERS[reached] || null
  const next = TIERS[reached + 1] || null
  const floor = current ? current.wager : 0
  const pct = next ? Math.min(1, Math.max(0, (wagered - floor) / (next.wager - floor))) : 1
  return { current, next, pct, reachedCount: reached + 1 }
}

// Per-row state for the milestones list.
export function tierStatus(tier, wagered, known) {
  if (!known) return 'locked'
  if (wagered >= tier.wager) return 'reached'
  const firstOpen = TIERS.find((t) => wagered < t.wager)
  return firstOpen && firstOpen.id === tier.id ? 'next' : 'locked'
}

export { TIERS }
