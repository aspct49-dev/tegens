// Search and social metadata for every public page, shared by the browser (src/App.jsx
// updates the head on each navigation) and the server (server/seo.js writes the same
// tags into the HTML it sends, plus robots.txt and sitemap.xml). Plain ESM so Node can
// import it: no JSX, no browser globals.
//
// Each page: { path, title, description, h1 }. `title` is the full <title> (unique per
// page); `h1` is the plain-text heading used in the server-rendered fallback content.

import { config } from './config.js'
import { ROUTES } from './routes.js'

export const SITE_NAME = config.brandName

// Found in the project (the Kick webhook URL in src/admin/KickStatus.jsx). The server reads
// SITE_URL from the environment first, so this is only the fallback.
export const DEFAULT_SITE_URL = 'https://tegens.bet'

// 1200 × 630 share image (public/assets/og-image.png)
export const OG_IMAGE = { path: '/assets/og-image.png', width: 1200, height: 630, alt: 'TEGENS: Rainbet rewards under code TEGENS' }

const code = config.referralCode.toUpperCase()
const pool = `$${config.prizePool.toLocaleString('en-US')}`

const DESCRIPTIONS = {
  '/': `TEGENS rewards for Rainbet players under code ${code}: a ${pool} monthly leaderboard, wager milestones, raffles, giveaways and stream events.`,
  '/leaderboard': `Climb the ${pool} monthly Rainbet leaderboard. Wager under code ${code} and the top ${config.prizes.length} players share the prize pool every month.`,
  '/biggest-wins': `The biggest slot wins by players under code ${code}, ranked by multiplier or payout. Submit your own Rainbet win with the bet link.`,
  '/milestones': `Unlock cash rewards as your lifetime Rainbet wager under code ${code} grows, from Bronze to Infernal Diamond.`,
  '/bonuses': `Every reward you get for playing on Rainbet under code ${code}: rakeback, the monthly leaderboard, milestones, raffles and more.`,
  '/store': 'Spend the points you earn watching the TEGENS stream on bonus buys, free spins and prizes in the item store.',
  '/raffles': `Every $${config.raffle.ticketUnit.toLocaleString('en-US')} wagered on Rainbet under code ${code} is a raffle ticket. See this month's prize pool, your tickets and the provably fair draws.`,
  '/giveaways': 'Every TEGENS stream giveaway winner, with what they won and when. Giveaways run live in the Kick chat.',
  '/vips': 'TEGENS VIP slot calls: the slots each VIP called live on stream and how much they paid.',
  '/bonus-hunt': 'Follow the live TEGENS bonus hunt: every bonus collected, the start balance and the results as each one opens.',
  '/guess-the-balance': 'Guess the final balance of the TEGENS bonus hunt in Kick chat. See the current round, the guesses and past winners.',
  '/tournaments': 'Head-to-head slot tournaments played live on the TEGENS stream, with the bracket and every result.',
  '/challenges': `Hit the target multiplier on a slot under code ${code} and claim a cash bounty on top of your win.`,
  '/slot-picker': 'Can’t decide what to play? Spin the TEGENS random slot picker across thousands of slots and providers.',
  '/refer': `Refer a high roller to Rainbet under code ${code} and earn $${config.referral.reward.toLocaleString('en-US')} once they've wagered $${config.referral.minWager.toLocaleString('en-US')}.`,
  '/how-to-sign-up': `How to sign up on Rainbet with code ${code} in a few steps, so every bet counts toward TEGENS rewards.`,
  '/socials': 'The latest TEGENS videos and every place to follow along: Kick, YouTube, Discord, X and Instagram.',
  '/contact': 'Get in touch with the TEGENS team about prizes, your account, partnerships or anything else.',
  '/terms': 'The rules for taking part in the TEGENS leaderboard, raffles, giveaways and stream events.',
  '/privacy': 'What the TEGENS site handles about you, why, who else is involved, and how to have it removed.',
  '/responsible-gambling': 'Gambling should be entertainment you can afford. How to keep it that way, and where to get help if it isn’t.',
}

// Pages that are linked from the footer but not the side nav
const EXTRA = [
  { path: '/vips', title: 'TEGENS — VIP Calls', h1: 'VIP Calls' },
  { path: '/terms', title: 'TEGENS — Terms of Service', h1: 'Terms of Service' },
  { path: '/privacy', title: 'TEGENS — Privacy Policy', h1: 'Privacy Policy' },
  { path: '/responsible-gambling', title: 'TEGENS — Responsible Gambling', h1: 'Responsible Gambling' },
]

/** Every indexable page, in side-nav then footer order */
export const PAGES = [
  ...ROUTES.filter((r) => r.path && !r.soon).map((r) => ({ path: r.path, title: r.title, h1: r.title.replace(/^TEGENS — /, ''), label: r.label })),
  ...EXTRA.map((p) => ({ ...p, label: p.h1 })),
].map((p) => ({ ...p, description: DESCRIPTIONS[p.path] ?? DESCRIPTIONS['/'] }))

/** Signed-in or tool pages: served, but kept out of search results */
export const PRIVATE = [
  { path: '/admin', title: 'TEGENS — Admin' },
  { path: '/profile', title: 'TEGENS — Profile' },
]

export const NOT_FOUND = { title: 'TEGENS — Page Not Found', description: 'This page doesn’t exist. Find the leaderboard, rewards and stream events from the TEGENS home page.', h1: 'Page not found' }

export const seoFor = (path) => PAGES.find((p) => p.path === path) ?? null
export const isPrivate = (path) => PRIVATE.some((p) => p.path === path) || path.startsWith('/overlay/')

/** Public profiles of the brand, from config (Organization `sameAs`) */
export const SAME_AS = [
  config.kickUrl,
  `https://www.youtube.com/@${config.socials.youtube.handle}`,
  `https://x.com/${config.socials.twitter}`,
  `https://www.instagram.com/${config.socials.instagram}/`,
]
