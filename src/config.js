// ============================================================================
//  TEGENS LEADERBOARD — EDIT EVERYTHING HERE
// ============================================================================

export const config = {
  brandName: 'TEGENS',
  casino: 'Rainbet',
  casinoUrl: 'https://rainbet.com/?r=tegens',
  referralCode: 'Tegens',
  homeUrl: '/',

  // Total pool shown in the hero + top-bar banner.
  prizePool: 10000,

  // The period queried from the Rainbet affiliate API (inclusive, 'YYYY-MM-DD').
  // By default it runs monthly from `resetDay` (00:00 UTC) to the day before
  // `resetDay` next month (23:59:59 UTC), e.g. 13 Oct → 12 Nov, then rolls
  // over automatically. Set startAt + endAt to pin an exact period instead.
  leaderboard: {
    resetDay: 13,
    startAt: null,
    endAt: null,
  },

  // Prize for each rank, 1st → 10th. Players are ranked by wagered amount.
  // (Sums to prizePool above: 10,000.)
  prizes: [5000, 2500, 1000, 400, 300, 250, 200, 150, 100, 100],

  // Decorative podium avatars (1st, 2nd, 3rd) and the avatar used for ranks 4+.
  rankAvatars: ['/assets/avatar-1.png', '/assets/avatar-2.png', '/assets/avatar-3.png'],
  rowAvatar: '/assets/avatar-row.png',

  // Past leaderboards section. Hidden while this list is empty.
  // Example: { prizePool: 10000, winner: 'Tegens***', href: '#' }
  pastLeaderboards: [],
}

// Resolve the active period: pinned dates if set, otherwise the monthly cycle
// that started on the most recent `resetDay` (UTC).
export function getPeriod() {
  const { startAt, endAt, resetDay = 1 } = config.leaderboard
  if (startAt && endAt) return { startAt, endAt }
  const now = new Date()
  const y = now.getUTCFullYear()
  // Before this month's reset day we're still in the cycle that began last month.
  const m = now.getUTCMonth() - (now.getUTCDate() < resetDay ? 1 : 0)
  const iso = (d) => d.toISOString().slice(0, 10)
  return {
    startAt: iso(new Date(Date.UTC(y, m, resetDay))),
    endAt: iso(new Date(Date.UTC(y, m + 1, resetDay - 1))),
  }
}
