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
  casinoUrl: 'https://rainbet.com/',
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
    discord: 'https://discord.gg/',
    twitter: 'https://x.com/',
    kick: 'https://kick.com/',
    youtube: 'https://youtube.com/',
    instagram: 'https://instagram.com/',
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
    href: 'https://discord.gg/',
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
    href: 'https://rainbet.com/',
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
