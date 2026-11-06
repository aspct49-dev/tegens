// Every page, in side-nav order. `icon` names a pair of nav icons in
// /assets/td (grey and -active blue); refer and help draw their own glyph.
// `group` puts the page under a side-nav heading (NAV_GROUPS; the first group has none).
export const NAV_GROUPS = [
  { id: 'main', title: null },
  { id: 'rewards', title: 'Rewards' },
  { id: 'stream', title: 'On stream' },
  { id: 'help', title: 'Help' },
]

export const ROUTES = [
  { path: '/', group: 'main', label: 'Home', icon: 'home', title: 'TEGENS — Rainbet Rewards, Leaderboard & Milestones' },
  { path: '/leaderboard', group: 'main', label: 'Monthly Leaderboard', icon: 'leaderboard', title: 'TEGENS — $10,000 Monthly Rainbet Leaderboard' },
  // `soon`: shown in the side nav with a "Soon" tag, not a link (no page yet)
  { path: null, soon: true, group: 'main', label: 'Weekly Leaderboard', icon: 'weekly' },
  { path: '/biggest-wins', group: 'main', label: 'Biggest Wins', icon: 'wins', title: 'TEGENS — Biggest Wins' },
  { path: '/milestones', group: 'rewards', label: 'Milestones', icon: 'milestones', title: 'TEGENS — Wager Milestones' },
  { path: '/bonuses', group: 'rewards', label: 'Bonuses', icon: 'bonuses', title: 'TEGENS — Rewards & Bonuses' },
  { path: '/store', group: 'rewards', label: 'Item Store', icon: 'store', title: 'TEGENS — Item Store' },
  { path: '/raffles', group: 'rewards', label: 'Raffles', icon: 'raffles', title: 'TEGENS — Monthly Wager Raffle' },
  { path: '/giveaways', group: 'stream', label: 'Giveaways', icon: 'giveaways', title: 'TEGENS — Giveaway Winners' },
  { path: '/bonus-hunt', group: 'stream', label: 'Bonus Hunt', icon: 'hunt', title: 'TEGENS — Bonus Hunt' },
  { path: '/guess-the-balance', group: 'stream', label: 'Guess the Balance', icon: 'guess', title: 'TEGENS — Guess the Balance' },
  { path: '/tournaments', group: 'stream', label: 'Tournaments', icon: 'tournaments', title: 'TEGENS — Slot Tournaments' },
  { path: '/challenges', group: 'rewards', label: 'Challenges', icon: 'challenges', title: 'TEGENS — Slot Challenges' },
  { path: '/slot-picker', group: 'stream', label: 'Slot Picker', icon: 'slots', title: 'TEGENS — Random Slot Picker' },
  { path: '/refer', group: 'rewards', label: 'Refer to Earn', icon: 'refer', title: 'TEGENS — Refer a High Roller' },
  { path: '/how-to-sign-up', group: 'help', label: 'How to sign up', icon: 'help', title: 'TEGENS — How to Sign Up on Rainbet' },
  { path: '/socials', group: 'help', label: 'Socials & Media', icon: 'socials', title: 'TEGENS — Socials & Media' },
  { path: '/contact', group: 'help', label: 'Contact', icon: 'contact', title: 'TEGENS — Contact Us' },
]

export const routeFor = (path) => ROUTES.find((r) => r.path === path) || ROUTES[0]
