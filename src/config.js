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

  // How wager counts toward the leaderboard by the game's RTP (shown in Competition Rules).
  // Lower-RTP games count in full; high-RTP games count for less.
  wagerWeights: [
    { rtp: '96%', weight: '1x' },
    { rtp: '97%', weight: '0.75x' },
    { rtp: '98%', weight: '0.5x' },
    { rtp: '99%', weight: '0.25x' },
    { rtp: '99.6%', weight: '0.1x' },
  ],

  // Prize for each rank, 1st → 10th. Players are ranked by wagered amount.
  // (Sums to prizePool above: 10,000.)
  prizes: [5000, 2500, 1000, 400, 300, 250, 200, 150, 100, 100],

  // Decorative podium avatars (1st, 2nd, 3rd) and the avatar used for ranks 4+.
  rankAvatars: ['/assets/avatar-1.png', '/assets/avatar-2.png', '/assets/avatar-3.png'],
  rowAvatar: '/assets/avatar-row.png',

  // Past leaderboards section. Hidden while this list is empty. "View Winners"
  // loads that period's final top 10 from the API; `prizes` defaults to the
  // current split above.
  // Example: { prizePool: 10000, winner: 'Tegens***', startAt: '2026-09-13', endAt: '2026-10-12' }
  pastLeaderboards: [],

  // Claims, store redemptions and referrals are all handled by ticket here.
  discordUrl: 'https://discord.gg/m8NdcKkXfK',
  // The stream (giveaways, slot calls and Guess the Balance run in its chat)
  kickUrl: 'https://kick.com/travellingdegens',

  // Socials & Media page (/socials). The server reads the latest videos from
  // the YouTube channel's feed (channelId) and the member counts from the
  // Discord invite in discordUrl above (it must be a live, non-expiring invite).
  socials: {
    youtube: { handle: 'tegens', channelId: 'UCm4MXPNGJE8CbKOwiaMwxLA' },
    twitter: 'TrvllingDegens',
    instagram: 'travellingdegens',
    discordPerks: ['Exclusive Bonuses', 'Many Giveaways', 'Fast Support', 'Major Announcements', 'Great Community', 'Live/YT Updates'],
  },

  // Wager milestones. A player's lifetime wager under the code is summed from
  // `trackSince` to today and compared with each tier's `wager`.
  milestones: {
    trackSince: '2026-01-01',
    tiers: [
      { id: 'bronze', name: 'Bronze', wager: 10000, prize: 10, color: '#e4a884', icon: '/assets/td/tier-bronze.png' },
      { id: 'silver', name: 'Silver', wager: 25000, prize: 25, color: '#c4c4c4', icon: '/assets/td/tier-silver.png' },
      { id: 'gold', name: 'Gold', wager: 50000, prize: 50, color: '#ffd482', icon: '/assets/td/tier-gold.png' },
      { id: 'platinum', name: 'Platinum', wager: 100000, prize: 125, color: '#ff595b', icon: '/assets/td/tier-platinum.png' },
      { id: 'diamond', name: 'Diamond', wager: 250000, prize: 250, color: '#92e0ff', icon: '/assets/td/tier-diamond.png' },
      { id: 'infernal', name: 'Infernal', wager: 500000, prize: 500, color: '#ff8083', icon: '/assets/td/tier-infernal.png' },
      { id: 'infernal-diamond', name: 'Infernal Diamond', wager: 1000000, prize: 1250, color: '#ffd78b', icon: '/assets/td/tier-infernal-diamond.png' },
    ],
  },

  // Item stores: the items a fresh install starts with (server/features/shop.js copies them into
  // the shopItems table the first time it's read; after that the admin panel is the source).
  // `store`: 'wager' (Wager Store, paid in wager points) or 'watch' (Watch Store, Botrix points).
  // `cost` in points; `stock` 0 shows as sold out. `art` 'bonus': the picture under two lines of
  // text drawn by the page (artTop gold, artBottom white).
  storeItems: [
    { id: '50-usdc', store: 'wager', name: '50 USDC', cost: 50000, stock: 10, art: 'bonus', artTop: '$50', artBottom: 'USDC', image: '/assets/td/item-usdc-coin-v2.png' },
    { id: '250-usdc', store: 'wager', name: '250 USDC', cost: 250000, stock: 5, art: 'bonus', artTop: '$250', artBottom: 'USDC', image: '/assets/td/item-usdc-coin-v2.png' },
    { id: '1000-usdc', store: 'wager', name: '1,000 USDC', cost: 1000000, stock: 2, art: 'bonus', artTop: '$1,000', artBottom: 'USDC', image: '/assets/td/item-usdc-coin-v2.png' },
    { id: '100-bonus-buy', store: 'watch', name: '$100 Bonus Buy', cost: 10000, stock: 4, art: 'bonus', artTop: '$100', artBottom: 'BONUS BUY', image: '/assets/td/item-fith2-v5.png' },
    { id: '250-bonus-buy', store: 'watch', name: '$250 Bonus Buy', cost: 25000, stock: 5, art: 'bonus', artTop: '$250', artBottom: 'BONUS BUY', image: '/assets/td/item-fith2-v5.png' },
    { id: '500-bonus-buy', store: 'watch', name: '$500 Bonus Buy', cost: 50000, stock: 3, art: 'bonus', artTop: '$500', artBottom: 'BONUS BUY', image: '/assets/td/item-fith2-v5.png' },
    { id: '1000-bonus-buy', store: 'watch', name: '$1,000 Bonus Buy', cost: 100000, stock: 1, art: 'bonus', artTop: '$1,000', artBottom: 'BONUS BUY', image: '/assets/td/item-fith2-v5.png' },
  ],

  // Refer to Earn: the high-roller referral reward and its qualifying wager.
  referral: { reward: 500, minWager: 100000 },

  // Monthly wager raffle (/raffles). Every `ticketUnit` dollars wagered under the
  // code in the period is one ticket. start/end (inclusive, 'YYYY-MM-DD') default
  // to the current calendar month. Fair draws: run `node scripts/raffle-seed.mjs`,
  // publish `seedHash` BEFORE the month ends, then reveal `seed` after it ends.
  // `id` is part of every draw's hash, so give each month its own.
  // `rerolled`: 0-based draw numbers to redraw (the winner couldn't take it).
  raffle: {
    id: null, // null: the period's month, e.g. '2026-10'
    title: 'Monthly Wager Raffle',
    start: null,
    end: null,
    prizePool: 1000,
    prizePerDraw: 200,
    maxWinsPerPerson: 2,
    ticketUnit: 1000,
    seedHash: null,
    seed: null,
    rerolled: [],
  },
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
