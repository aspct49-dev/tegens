// ============================================================================
//  TEGENS LEADERBOARD — EDIT EVERYTHING HERE
// ----------------------------------------------------------------------------
//  This is the only file you need to touch to update the site's content.
//  Change the prize pool, the casino/code, the countdown end date, and the
//  list of players below. The site rebuilds the podium + table automatically.
// ============================================================================

export const config = {
  brandName: 'TEGENS',
  casino: 'Rainbet',
  casinoUrl: 'https://rainbet.com/?r=tegens',
  referralCode: 'TEGENS',
  prizePool: 6000,           // total $ pool, shown in the hero
  totalGivenAway: 250000,    // running "total given away" counter

  // The active leaderboard period. The site queries the Rainbet affiliate API
  // for this window (dates are inclusive, format 'YYYY-MM-DD'). The countdown
  // ticks down to the end of `endAt`. Update these each period.
  leaderboard: {
    startAt: '2026-06-01',
    endAt: '2026-06-30',
  },

  // Prize for each rank, 1st → last. Players are ranked by wagered amount and
  // matched to these in order. Anyone past this list shows no prize.
  // (This list sums to the prizePool above: 6000.)
  prizes: [2000, 1200, 800, 600, 450, 350, 250, 150, 120, 80],

  // Decorative profile pictures by rank (1st, 2nd, 3rd). Ranks past this list
  // fall back to the player's initial. Files live in /public.
  rankAvatars: ['/magicpiggy.png', '/befy.png', '/pug.png'],

  socials: {
    discord: 'https://discord.gg/76dAJpPhk',
    instagram: 'https://www.instagram.com/travellingdegens/',
    kick: 'https://kick.com/travellingdegens',
  },

  // Promo banner under the bonus cards on the home page. Just the headline +
  // copy: the top-3 winner cards are pulled live from the same leaderboard feed
  // (and the same offline fallback), so they always match the leaderboard page.
  promo: {
    amount: 6000,
    title: 'LEADERBOARD',
    subtitle: 'Climb to the top of the leaderboard & win crazy prizes!',
    cta: 'View Leaderboard',
    to: '/leaderboard',
  },
}

// The three "Choose your exclusive Bonus" cards on the home page.
// `featured: true` gives the blue highlighted treatment (middle card).
export const bonuses = [
  {
    img: '/giftbox.png',
    title: 'BONUSES',
    subtitle: 'Deposit & Rank Up',
    accent: 'gold',
    rows: [
      'Make your first Deposit',
      'Wager 10x Deposit amount',
      'Rank up to unlock extra cash',
      'Contact us via Discord to claim',
    ],
    cta: 'CLAIM BONUS',
    href: 'https://discord.gg/76dAJpPhk',
  },
  {
    img: '/orb.png',
    title: '$6,000',          // tip: keep in sync with config.prizePool
    subtitle: 'Monthly Leaderboard',
    accent: 'gold',
    featured: true,
    rows: [
      'Must be under code TEGENS',
      'Wager on Rainbet.com',
      'Climb to secure Top Places',
      'Win big rewards & enjoy!',
    ],
    cta: 'VIEW LEADERBOARD',
    to: '/leaderboard',
  },
  {
    img: '/coin.png',
    title: 'BENEFITS',
    subtitle: 'Under code TEGENS',
    accent: 'gold',
    rows: [
      '3.5% Rakeback',
      '300% Welcome Bonus',
      'Daily Giveaways',
      'Exclusive High-Roller Rewards',
    ],
    cta: 'CLAIM BONUS',
    href: 'https://rainbet.com/?r=tegens',
  },
]

// Offline fallback only. The live leaderboard pulls real players from the
// Rainbet affiliate API; this sample data is shown if that request fails so
// the page never renders empty. Prizes are assigned by rank from config.prizes.
export const fallbackPlayers = [
  { name: 'tegenxtraded',    wagered: 232.57 },
  { name: 'realmaksdis1828', wagered: 212.72 },
  { name: 'TheRodzz',        wagered: 173.55 },
  { name: 'xiofo888',        wagered: 17.55 },
  { name: 'devynAF',         wagered: 13.65 },
  { name: 'rodzytegens',     wagered: 8.55 },
  { name: 'degensXdagestan', wagered: 7.94 },
  { name: 'Gambafix',        wagered: 5.07 },
]

// ============================================================================
//  REWARDS / VIP TIERS  (the /rewards page)
// ----------------------------------------------------------------------------
//  For every `cashbackPer` wagered under code TEGENS we pay back `cashbackAmount`.
//  Each tier lists the cumulative wager needed to reach each level (`reach`,
//  last value = the tier total) and how many of the six PERKS are unlocked.
//  Perk order: Rakeback · Daily · Weekly · Monthly · Pre-Monthly · Freespins.
// ============================================================================
export const rewards = {
  cashbackPer: 10000,
  cashbackAmount: 10,
  tiers: [
    { key: 'bronze',   name: 'Bronze',   range: 'I - IV', icon: '/ranks/bronze.webp',   perks: 4, reach: [4000, 11000, 22000, 36000] },
    { key: 'silver',   name: 'Silver',   range: 'I - IV', icon: '/ranks/silver.webp',   perks: 5, reach: [50000, 65000, 80000, 95000] },
    { key: 'gold',     name: 'Gold',     range: 'I - V',  icon: '/ranks/gold.webp',     perks: 6, reach: [110000, 150000, 225000, 350000, 500000] },
    { key: 'platinum', name: 'Platinum', range: 'I - V',  icon: '/ranks/platinum.webp', perks: 6, reach: [700000, 1300000, 2500000, 4500000, 7000000] },
    { key: 'diamond',  name: 'Diamond',  range: 'I - V',  icon: '/ranks/diamond.webp',  perks: 6, reach: [10000000, 25000000, 50000000, 100000000, 250000000] },
    { key: 'infernal', name: 'Infernal', range: '',       icon: '/ranks/infernal.webp', perks: 6, reach: [500000000] },
    { key: 'infernal-diamond', name: 'Infernal Diamond', range: '', icon: '/ranks/infernal-diamond.webp', perks: 6, reach: [1000000000] },
  ],
}
