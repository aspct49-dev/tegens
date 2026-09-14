// ============================================================================
//  TEGENS LEADERBOARD — EDIT EVERYTHING HERE
// ----------------------------------------------------------------------------
//  This is the only file you need to touch to update the site's content.
//  Change the prize pool, the casino/code, the countdown end date, and the
//  list of players below. The site rebuilds the podium + table automatically.
// ============================================================================

// The leaderboard period rolls over on its own: it is always the current
// calendar month in UTC. This is computed on every page load (and on every
// snapshot run), so at 00:00 UTC on the 1st the site starts querying the new
// month with no edit and no redeploy — nginx keeps serving the same bundle.
const pad = (n) => String(n).padStart(2, '0')

export function monthWindow(date = new Date()) {
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth()
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return {
    startAt: `${y}-${pad(m + 1)}-01`,
    endAt: `${y}-${pad(m + 1)}-${pad(lastDay)}`,
  }
}

// The month before `date`'s month — the one snapshot-winners.mjs finalizes
// into the winners archive once the calendar flips.
export function previousMonthWindow(date = new Date()) {
  return monthWindow(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1)))
}

// ============================================================================
//  RAFFLE  (runs in the leaderboard section, /leaderboard)
// ----------------------------------------------------------------------------
//  Every `ticketCost` wagered under the code in the window earns one ticket
//  (whole tickets only — $199 is one ticket). Tickets are read live from the
//  same Rainbet affiliate feed as the leaderboard.
//
//  Winners are NOT drawn by the site. When the window closes the page switches
//  to a "drawing winners" notice and freezes the final ticket counts. Draw the
//  winners yourself, then publish them by filling in `winners` below — in
//  prize order, using the username exactly as Rainbet reports it. The page
//  masks names on display.
// ============================================================================
export const raffle = {
  // Inclusive dates, 'YYYY-MM-DD'. Entries close at 23:59:59 UTC on `endAt`.
  // Fixed rather than rolling, so the "drawing winners" state holds until
  // you publish results instead of resetting at midnight on the 1st.
  startAt: '2026-09-01',
  endAt: '2026-09-30',
  ticketCost: 100,
  prizes: [6000, 2500, 1500],   // 1st, 2nd, 3rd — the pool is their sum

  // Leave empty until drawn. To publish results:
  //   winners: [
  //     { name: 'username1' },   // 1st — $6,000
  //     { name: 'username2' },   // 2nd — $2,500
  //     { name: 'username3' },   // 3rd — $1,500
  //   ],
  winners: [],
}

export const rafflePool = raffle.prizes.reduce((sum, p) => sum + p, 0)

// "$10,000" — the pool as display text, for copy that can't call fmtMoney.
const rafflePoolText = `$${rafflePool.toLocaleString('en-US')}`

export const config = {
  brandName: 'TEGENS',
  casino: 'Rainbet',
  casinoUrl: 'https://rainbet.com/?r=tegens',
  referralCode: 'TEGENS',
  // Used on the legal pages. TODO: replace with your real support email
  // (or leave it — the legal pages also point users to your Discord).
  contactEmail: 'support@tegens.gg',
  prizePool: 3000,           // total $ pool, shown in the hero
  totalGivenAway: 250000,    // running "total given away" counter

  // The monthly WAGER RACE is off: the leaderboard section runs the raffle
  // instead (see `raffle` below). While this is true snapshot-winners.mjs
  // archives nothing, so no wager-race "winners" get published for months the
  // race didn't run.
  paused: true,

  // The active period — always the current UTC month. Nothing to edit here
  // each month; see monthWindow() above. The countdown ticks down to the last
  // day of the month, at which point the site rolls to the next one.
  leaderboard: monthWindow(),

  // Prize for each rank, 1st → last. Players are ranked by wagered amount and
  // matched to these in order. The table only shows as many rows as there are
  // prizes here, so the length of this list = the number of paid places.
  // (This list sums to the prizePool above: 3000.)
  //
  // Changing this changes the CURRENT month only. Past months keep the split
  // they were archived with — snapshot-winners.mjs stores each period's prizes
  // alongside its winners and never rewrites a finalized one.
  prizes: [1000, 600, 400, 300, 250, 200, 150, 100],

  // Decorative profile pictures by rank (1st, 2nd, 3rd). Ranks past this list
  // fall back to the player's initial. Files live in /public.
  rankAvatars: ['/magicpiggy.png', '/befy.png', '/pug.png'],

  socials: {
    discord: 'https://discord.gg/76dAJpPhk',
    instagram: 'https://www.instagram.com/travellingdegens/',
    kick: 'https://kick.com/travellingdegens',
  },

  // The /links page — the one URL to put in a bio. Cards render top to bottom
  // in this order, so the thing you most want tapped goes first. `accent: gold`
  // gives the highlighted treatment; `icon` names an entry in LINK_ICONS
  // (Links.jsx). Use `to` for an internal route and `href` for an outside link.
  linksPage: {
    // Square, logo centred in the frame. Swap for a real profile picture any time.
    avatar: '/avatar.webp',
    handle: '@travellingdegens',
    tagline: 'Everything TEGENS in one place — tap a link below.',
    cards: [
      {
        img: '/rainbet_logo.webp',   // `img` wins over `icon` when both are set
        accent: 'gold',
        title: 'Play on Rainbet',
        subtitle: 'Sign up & play under code TEGENS',
        href: 'https://rainbet.com/?r=tegens',
      },
      {
        icon: 'ticket',
        title: `${rafflePoolText} Raffle`,
        subtitle: `Every $${raffle.ticketCost} wagered = 1 ticket`,
        to: '/leaderboard',
      },
      {
        icon: 'discord',
        title: 'Join our Discord',
        subtitle: 'Giveaways, updates & the community',
        href: 'https://discord.gg/76dAJpPhk',
      },
      {
        icon: 'bolt',
        title: 'Rank-Up Rewards',
        subtitle: 'Rakeback, cashback & VIP tiers',
        to: '/rewards',
      },
      {
        icon: 'kick',
        title: 'Watch on Kick',
        subtitle: 'Live streams & slot sessions',
        href: 'https://kick.com/travellingdegens',
      },
      {
        icon: 'instagram',
        title: 'Instagram',
        subtitle: 'Clips, wins & announcements',
        href: 'https://www.instagram.com/travellingdegens/',
      },
      {
        icon: 'x',
        title: 'X / Twitter',
        subtitle: 'Drops, codes & daily posts',
        // TODO: confirm the handle — assumed to match Instagram/Kick.
        href: 'https://x.com/travellingdegens',
      },
    ],
  },

  // Promo banner under the bonus cards on the home page. Points at the raffle;
  // the amount and the three prize cards come from `raffle` above, so the
  // banner can't drift from the raffle page.
  promo: {
    title: 'RAFFLE',
    subtitle: `Every $${raffle.ticketCost} wagered earns a ticket — 3 winners share the pool!`,
    cta: 'Enter the Raffle',
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
    title: rafflePoolText,   // follows raffle.prizes
    subtitle: 'Raffle',
    accent: 'gold',
    featured: true,
    rows: [
      'Must be under code TEGENS',
      'Wager on Rainbet.com',
      `Every $${raffle.ticketCost} wagered = 1 ticket`,
      `3 winners: ${raffle.prizes.map((p) => `$${p.toLocaleString('en-US')}`).join(' / ')}`,
    ],
    cta: 'ENTER RAFFLE',
    to: '/leaderboard',
  },
  {
    img: '/coin.png',
    title: 'BENEFITS',
    subtitle: 'Under code TEGENS',
    accent: 'gold',
    rows: [
      '3.5% Rakeback',
      // A row can be an object when it needs explanatory copy under the label.
      {
        label: 'First Deposit',
        detail: 'Up to 100% bonus, claimable as you bet at a rate of Wager Amount x 1% x 20% per bet. Expires after full bonus is claimed.',
      },
      'Daily Giveaways',
      'Exclusive High-Roller Rewards',
    ],
    cta: 'CLAIM BONUS',
    href: 'https://rainbet.com/?r=tegens',
  },
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
