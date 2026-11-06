// Bonus hunt maths, shared by the server (server/features/hunts.js) and the pages
// (admin editor, overlay, public tracker). Pure: no Node or browser imports.
//
//   hunt:  { id, number, name, startBalance, currency, status, bonuses, createdAt, finishedAt }
//   bonus: { id, game, slug, image, provider, bet, payout (null until opened; 0 is a real result), note, badge }
//   status: 'collecting' (buying bonuses) → 'opening' (paying them out) → 'finished'

export const HUNT_STATUSES = ['collecting', 'opening', 'finished']

export const HUNT_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'BRL', 'TRY', 'INR', 'JPY']

/** Badges offered when adding a bonus (any other text is a custom badge) */
export const HUNT_BADGES = ['Super Bonus', '5 Scatter', 'Max Level']

const formats = new Map()
function format(currency) {
  const code = HUNT_CURRENCIES.includes(currency) ? currency : 'USD'
  let f = formats.get(code)
  if (!f) {
    f = new Intl.NumberFormat('en-US', { style: 'currency', currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2 })
    formats.set(code, f)
  }
  return f
}

/** An amount in the hunt's currency: $1,200.00, €1,200.00, CA$1,200.00 ("—" for none) */
export const huntMoney = (value, currency = 'USD') => (value == null || !Number.isFinite(value) ? '—' : format(currency).format(value))

/** The currency's sign for input fields: $, €, £, CA$… */
export const currencySymbol = (currency = 'USD') => format(currency).formatToParts(0).find((p) => p.type === 'currency')?.value ?? '$'

/** 12.3456 → "12.35×" ("—" for none) */
export const huntX = (v, digits = 2) =>
  v == null || !Number.isFinite(v) ? '—' : `${v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}×`

export const bonusMultiplier = (b) => (b.payout != null && b.bet > 0 ? b.payout / b.bet : null)

/** The bonus being opened right now: the first without a payout, while the hunt is opening (-1 when none) */
export const openingIndex = (hunt) => (hunt?.status === 'opening' ? hunt.bonuses.findIndex((b) => b.payout == null) : -1)

/**
 * Everything the pages show about a hunt.
 *   breakEven      average × needed across every bonus to get the start cost back
 *   liveBreakEven  × still needed on the unopened bonuses, given what's been won
 *   average        × of the opened bonuses (won / bet on them)
 *   avgRequired    money each unopened bonus needs to pay, on average, to break even
 *   currentAverage money paid per opened bonus
 *   bestWin        biggest payout · luckyWin: biggest multiplier
 */
export function huntStats(hunt) {
  const bonuses = hunt?.bonuses ?? []
  const start = hunt?.startBalance ?? 0
  const opened = bonuses.filter((b) => b.payout != null)
  const waiting = bonuses.filter((b) => b.payout == null)
  const totalBet = bonuses.reduce((s, b) => s + b.bet, 0)
  const totalWon = opened.reduce((s, b) => s + b.payout, 0)
  const openedBet = opened.reduce((s, b) => s + b.bet, 0)
  const waitingBet = waiting.reduce((s, b) => s + b.bet, 0)
  const toGo = Math.max(0, start - totalWon)
  let bestWin = null
  let luckyWin = null
  for (const b of opened) {
    if (!bestWin || b.payout > bestWin.payout) bestWin = b
    if (b.bet > 0 && (!luckyWin || b.payout / b.bet > luckyWin.payout / luckyWin.bet)) luckyWin = b
  }
  return {
    count: bonuses.length,
    opened: opened.length,
    remaining: waiting.length,
    totalBet,
    totalWon,
    profit: totalWon - start,
    breakEven: totalBet > 0 && start > 0 ? start / totalBet : null,
    liveBreakEven: waitingBet > 0 ? toGo / waitingBet : null,
    average: openedBet > 0 ? totalWon / openedBet : null,
    avgRequired: waiting.length > 0 ? toGo / waiting.length : null,
    currentAverage: opened.length > 0 ? totalWon / opened.length : null,
    totalX: totalBet > 0 && opened.length > 0 ? totalWon / totalBet : null,
    bestWin,
    luckyWin,
    current: openingIndex(hunt),
  }
}
