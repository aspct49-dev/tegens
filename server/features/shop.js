// The Item Store: two stores, each with its own points.
//   watch  WATCH points: BotRix loyalty points on the Kick channel (../botrix.js), earned by watching
//   wager  WAGER points: earned by wagering under the code on Rainbet: `wagerRate` points per $1 wagered
//          in the current SEASON, + admin adjustments made this season, - what was spent this season.
//          Seasons run `seasonMonths` months back to back from `wagerSince`; when one ends its unspent
//          points expire (seasonMonths 0: one season that never ends). Needs an approved Rainbet link
//          (the account's Rainbet username). Kept on our side: nothing to call to spend them.
// Each item belongs to one store; each purchase becomes an order an admin delivers or rejects.
//
// Buying takes the points straight away (BotRix, or the wager ledger) and holds one item from stock;
// the order then waits for an admin. Approving marks it delivered. Rejecting (with a reason the
// player sees) or the player cancelling gives the points back and returns the stock. An order
// is claimed (moved off pending) before any refund, so a double click can't refund twice, and
// a refund that fails puts it back to pending, so nobody loses points.
//
// Public (signed in with Kick to buy)
//   GET  /api/shop                          { items, me: { signedIn, kick, points, pointsError, rainbet, wagerPoints,
//                                            wagerError }, orders, settings: { cooldownDays, wagerCooldownDays, wagerRate,
//                                            season: { start, end } } }   (end: the season's last day, null: never)
//   POST /api/shop/redeem                   { itemId, note? }  → { order, points, orders }
//   POST /api/shop/orders/<id>/cancel       the player's own pending order → { orders, points }
// Admin
//   GET  /api/admin/shop/orders?status=pending|approved|rejected|cancelled|all&q=   → { orders, counts }
//   POST /api/admin/shop/orders/<id>        { action: 'approve' } | { action: 'reject', reason }   → same as GET (status=all)
//   GET  /api/admin/shop/items              { items, settings, canChange }   every item, hidden ones too
//   POST /api/admin/shop/items              { name, cost, stock, art, image, hidden, store }   add one
//   POST /api/admin/shop/items/<id>         any of those fields
//   POST /api/admin/shop/items/<id>/remove
//   GET  /api/admin/shop/points?name=       { viewer, player, history }   a viewer's points
//   POST /api/admin/shop/points             { name, delta, reason }  add (+) or take (−) points
//   GET  /api/admin/shop/points/log         { log }   the last changes made from the site
//   GET  /api/admin/shop/wager-points?name= { account, player, history }   a Rainbet username's wager points
//   POST /api/admin/shop/wager-points       { name, delta, reason }  add (+) or take (-) wager points
//   GET  /api/admin/shop/settings · POST { cooldownDays?, wagerCooldownDays?, wagerRate?, wagerSince?, seasonMonths? }
//                                            → { settings, season }
//
// Tables (times unix seconds)
//   shopItems:    [{ id, name, cost, stock (null: unlimited), store: watch|wager, art: product|cover|fs|bonus, image,
//                    artTop, artBottom, hidden, order }]   (no store: watch)
//                 art 'bonus': the picture sits under two lines of text drawn by the page (artTop gold, artBottom white)
//                 seeded from config.storeItems the first time it is read
//   shopOrders:   [{ id, store, userId, player, kick, rainbet, itemId, itemName, itemImage, cost, note,
//                    status: pending|approved|rejected|cancelled, at, decidedAt, decidedBy, reason,
//                    charged, refunded }]   newest first, at most 5,000
//   shopPointsLog:[{ id, at, store, kick, rainbet, delta, kind: redeem|refund|admin, reason, by, ok, error }]  newest first
//   shopWagerAdjust: [{ id, key, name, delta, reason, by, at }]   admin changes to wager points (key: lower-case Rainbet name)
//   shopSettings: { cooldownDays (watch store), wagerCooldownDays, wagerRate, wagerSince (first season's start), seasonMonths }

import { randomBytes } from 'node:crypto'
import { config } from '../../src/config.js'
import { approvedRainbet, displayName } from '../auth.js'
import { logActivity } from '../audit.js'
import { adjustBotrixPoints, botrixCanChange, BotrixError, getBotrixViewer } from '../botrix.js'
import { json, nowSeconds } from '../http.js'
import { COLORS, notifyAdmins } from '../notify.js'
import { todayIso, wagersBetween } from '../rainbet.js'
import { read, update } from '../store.js'

class InputError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

const ITEMS = 'shopItems'
const ORDERS = 'shopOrders'
const LOG = 'shopPointsLog'
const SETTINGS = 'shopSettings'
const WADJ = 'shopWagerAdjust'
export const STORES = ['watch', 'wager']
const MAX_ORDERS = 5000
const LOG_SIZE = 2000
const DAY = 86_400
const KICK_NAME = /^[A-Za-z0-9_]{2,25}$/
const ARTS = ['product', 'cover', 'fs', 'bonus']
const STATUSES = ['pending', 'approved', 'rejected', 'cancelled']
const DEFAULT_SETTINGS = { cooldownDays: 0, wagerCooldownDays: 0, wagerRate: 1, wagerSince: '2026-11-01', seasonMonths: 3 }

const newId = () => randomBytes(6).toString('base64url')
const fmt = (n) => Number(n).toLocaleString('en-US')

// ---------------------------------------------------------------- items

const seed = () =>
  config.storeItems.map((it, i) => ({
    id: it.id,
    name: it.name,
    cost: it.cost,
    stock: it.stock ?? null,
    art: ARTS.includes(it.art) ? it.art : 'product',
    image: it.image ?? null,
    hidden: false,
    order: i,
  })).map(upgrade)

// The bonus-buy art used to have "$10K BONUS BUY" baked into the picture: those items now use
// the text-free picture with the words as editable fields (once; later edits are kept)
const OLD_BONUS = '/assets/td/item-bonusbuy.png'
const upgrade = (i) => {
  let out = i.image === OLD_BONUS && i.art === 'cover' ? { ...i, art: 'bonus', image: '/assets/td/item-bonusbuy-art.png', artTop: '$10K', artBottom: 'BONUS BUY' } : i
  if (!STORES.includes(out.store)) out = { ...out, store: 'watch' } // items from before the two stores
  return out
}

/** Every item (hidden ones too), in shop order; the first read writes the config's items */
async function allItems() {
  const list = await read(ITEMS, null)
  if (Array.isArray(list) && !list.some((i) => upgrade(i) !== i)) return list
  return update(ITEMS, (cur) => (Array.isArray(cur) ? cur.map(upgrade) : seed()), null)
}

const publicItem = (i) => ({ id: i.id, store: i.store, name: i.name, cost: i.cost, stock: i.stock, art: i.art, image: i.image, artTop: i.artTop ?? '', artBottom: i.artBottom ?? '' })
const storeOf = (o) => (o.store === 'wager' ? 'wager' : 'watch')
const pointsName = (store) => (store === 'wager' ? 'wager points' : 'watch points')
const sortItems = (list) => [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

const text = (v, label, max, required = true) => {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ')
  if (required && !s) throw new InputError(`Enter the ${label}.`)
  if (s.length > max) throw new InputError(`Keep the ${label} under ${max} characters.`)
  return s
}

const wholeNumber = (v, label, min, max) => {
  const n = Number(String(v ?? '').replace(/[,\s]/g, ''))
  if (String(v ?? '').trim() === '' || !Number.isInteger(n) || n < min || n > max)
    throw new InputError(`${label} must be a whole number from ${fmt(min)} to ${fmt(max)}.`)
  return n
}

/** Our own files (/…) or an https image */
const imageOf = (v) => {
  const s = String(v ?? '').trim()
  if (!s) return null
  if (/^\/[\w./-]+$/.test(s) && !s.includes('..')) return s
  if (/^https:\/\/[\w.-]+\/[^\s"'<>]*$/.test(s) && s.length <= 500) return s
  throw new InputError('Image: a site path like /assets/… or an https:// link.')
}

/** Item fields from a body; `partial`: only the ones present */
function itemFields(body, partial) {
  const out = {}
  const has = (k) => !partial || k in body
  if (has('name')) out.name = text(body.name, 'item name', 60)
  if (has('cost')) out.cost = wholeNumber(body.cost, 'Cost', 1, 100_000_000)
  if (has('stock')) out.stock = String(body.stock ?? '').trim() === '' || body.stock === null ? null : wholeNumber(body.stock, 'Stock', 0, 100_000)
  if (has('art')) {
    const a = String(body.art ?? 'product')
    if (!ARTS.includes(a)) throw new InputError('Art: product, cover, fs or bonus.')
    out.art = a
  }
  if (has('artTop')) out.artTop = text(body.artTop, 'big line', 14, false)
  if (has('artBottom')) out.artBottom = text(body.artBottom, 'second line', 22, false)
  if (has('image')) out.image = imageOf(body.image)
  if (has('hidden')) out.hidden = Boolean(body.hidden)
  if (has('store')) {
    if (!STORES.includes(body.store)) throw new InputError('Store: watch or wager.')
    out.store = body.store
  }
  return out
}

const restock = (itemId, by) =>
  update(ITEMS, (list) => (list ?? seed()).map((i) => (i.id === itemId && i.stock !== null ? { ...i, stock: Math.max(0, i.stock + by) } : i)), null)

// ---------------------------------------------------------------- orders, points log

const orders = () => read(ORDERS, [])
const readSettings = async () => ({ ...DEFAULT_SETTINGS, ...(await read(SETTINGS, DEFAULT_SETTINGS)) })

// ---------------------------------------------------------------- wager points

const isoDay = (t) => new Date(t).toISOString().slice(0, 10)
const dayMs = (d) => Date.parse(`${d}T00:00:00Z`)
/** 'YYYY-MM-DD' + n months (a day past the month's end rolls over, as Date.UTC does) */
const addMonths = (d, n) => {
  const [y, m, day] = d.split('-').map(Number)
  return isoDay(Date.UTC(y, m - 1 + n, day))
}

/**
 * The current wager season: { start, end, startSec, next } (dates 'YYYY-MM-DD', UTC; end = the last
 * day, null when seasons are off; next = the day the next season starts). Before the first season
 * starts, that first season.
 */
export function seasonOf(settings, today = todayIso()) {
  const anchor = settings.wagerSince
  const months = settings.seasonMonths
  let start = anchor
  if (months > 0) {
    for (let i = 0; i < 1200 && addMonths(start, months) <= today; i++) start = addMonths(start, months)
  }
  const next = months > 0 ? addMonths(start, months) : null
  const end = next ? isoDay(dayMs(next) - DAY * 1000) : null
  return { start, end, next, startSec: Math.floor(dayMs(start) / 1000) }
}

/** Wager points held by this season's open or delivered wager orders of this Rainbet key */
const wagerSpent = (list, key, fromSec) =>
  list
    .filter(
      (o) =>
        storeOf(o) === 'wager' &&
        String(o.rainbet ?? '').toLowerCase() === key &&
        o.at >= fromSec &&
        o.charged &&
        !o.refunded &&
        (o.status === 'pending' || o.status === 'approved'),
    )
    .reduce((n, o) => n + o.cost, 0)

/** A Rainbet username's wager this season: { found, wagered } */
async function wagerSince(name) {
  const key = String(name).trim().toLowerCase()
  const season = seasonOf(await readSettings())
  if (season.start > todayIso()) return { found: false, wagered: 0 }
  const hit = (await wagersBetween(season.start, todayIso())).find((r) => r.name.toLowerCase() === key)
  return { found: Boolean(hit), wagered: Math.round((hit?.wagered ?? 0) * 100) / 100 }
}

/**
 * A Rainbet username's wager points: earned (wager since wagerSince x wagerRate, rounded down)
 * + admin adjustments - spent. `list`: the orders to count (the list being updated, to check
 * inside an update); `got`: a wagerSince() result already fetched.
 */
async function wagerAccount(name, { list, got } = {}) {
  const key = String(name).trim().toLowerCase()
  const settings = await readSettings()
  const season = seasonOf(settings)
  const { found, wagered } = got ?? (await wagerSince(name))
  const earned = Math.floor(wagered * settings.wagerRate)
  const adjust = (await read(WADJ, [])).filter((a) => a.key === key && a.at >= season.startSec).reduce((n, a) => n + a.delta, 0)
  const spent = wagerSpent(list ?? (await orders()), key, season.startSec)
  return {
    name: String(name).trim(),
    found,
    wagered,
    rate: settings.wagerRate,
    since: season.start,
    season: { start: season.start, end: season.end },
    earned,
    adjust,
    spent,
    balance: Math.max(0, earned + adjust - spent),
  }
}

/** The approved Rainbet username of a signed-in user, or null */
const rainbetOf = async (user) => (user ? approvedRainbet((await read('players', [])).find((p) => p.id === user.id)) : null)

async function log(entry) {
  const row = { id: newId(), at: nowSeconds(), ...entry }
  await update(LOG, (list) => [row, ...list].slice(0, LOG_SIZE), []).catch((err) => console.error('[shop] log failed:', err))
}

/** What the player sees of their own order */
const myOrder = (o) => ({
  id: o.id,
  store: storeOf(o),
  itemId: o.itemId,
  itemName: o.itemName,
  itemImage: o.itemImage,
  cost: o.cost,
  note: o.note,
  status: o.status,
  at: o.at,
  decidedAt: o.decidedAt,
  reason: o.status === 'rejected' ? o.reason : null,
  refunded: Boolean(o.refunded),
})

const mine = async (user) => (await orders()).filter((o) => o.userId === user.id).slice(0, 50).map(myOrder)

/**
 * Give an order's points back and close it as rejected or cancelled. Claims it first
 * (pending only); if BotRix refuses the refund it goes back to pending.
 */
async function closeWithRefund(id, status, by, { reason = '', ownerId } = {}) {
  let claimed = null
  await update(
    ORDERS,
    (list) => {
      const o = list.find((x) => x.id === id)
      if (!o) throw new InputError('That order no longer exists.', 404)
      if (ownerId && o.userId !== ownerId) throw new InputError('That isn’t your order.', 403)
      if (o.status !== 'pending') throw new InputError('This order was already handled. Refresh to see it.', 409)
      o.status = status
      o.decidedAt = nowSeconds()
      o.decidedBy = by
      if (status === 'rejected') o.reason = String(reason).trim().slice(0, 200) || 'No reason given'
      claimed = { ...o }
      return list
    },
    [],
  )
  const o = claimed
  if (o.charged && storeOf(o) === 'wager') {
    // wager points are our own ledger: a closed order simply stops counting as spent
    await log({ store: 'wager', kick: o.kick, rainbet: o.rainbet, delta: o.cost, kind: 'refund', reason: `${status === 'cancelled' ? 'Cancelled' : 'Rejected'}: ${o.itemName}`, by, ok: true })
  } else if (o.charged) {
    try {
      await adjustBotrixPoints(o.kick, o.cost)
      await log({ store: 'watch', kick: o.kick, delta: o.cost, kind: 'refund', reason: `${status === 'cancelled' ? 'Cancelled' : 'Rejected'}: ${o.itemName}`, by, ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Refund failed.'
      await log({ kick: o.kick, delta: o.cost, kind: 'refund', reason: `Refund for ${o.itemName}`, by, ok: false, error: message })
      // not refunded: back to pending so the points aren't lost
      await update(ORDERS, (list) => list.map((x) => (x.id === id ? { ...x, status: 'pending', decidedAt: null, decidedBy: null, reason: null } : x)), [])
      throw new InputError(`Couldn’t give the points back (${message}), so the order is still pending. Try again.`, 502)
    }
  }
  await update(ORDERS, (list) => list.map((x) => (x.id === id ? { ...x, refunded: Boolean(o.charged) } : x)), [])
  await restock(o.itemId, 1)
  return o
}

/** The admin list: pending first (oldest first, the queue), then the rest newest first */
async function adminOrders(status = 'all', q = '', store = 'all') {
  const all = (await orders()).filter((o) => store === 'all' || storeOf(o) === store)
  const counts = Object.fromEntries(STATUSES.map((s) => [s, all.filter((o) => o.status === s).length]))
  const needle = q.trim().toLowerCase()
  const list = all
    .filter((o) => status === 'all' || o.status === status)
    .filter((o) => !needle || [o.kick, o.player, o.rainbet, o.itemName].some((v) => String(v ?? '').toLowerCase().includes(needle)))
    .sort((a, b) => {
      const ap = a.status === 'pending'
      const bp = b.status === 'pending'
      if (ap !== bp) return ap ? -1 : 1
      if (ap) return a.at - b.at
      return (b.decidedAt ?? b.at) - (a.decidedAt ?? a.at)
    })
  return { orders: list.slice(0, 300), counts }
}

// ---------------------------------------------------------------- public

async function shopView(user) {
  const [items, settings] = await Promise.all([allItems(), readSettings()])
  const me = { signedIn: Boolean(user), kick: user?.kick?.username ?? null, points: null, pointsError: null, rainbet: await rainbetOf(user), wagerPoints: null, wagerError: null }
  await Promise.all([
    me.kick &&
      getBotrixViewer(me.kick).then(
        (v) => (me.points = v?.points ?? 0),
        () => (me.pointsError = 'Couldn’t load your watch points from BotRix right now.'),
      ),
    me.rainbet &&
      wagerAccount(me.rainbet).then(
        (a) => (me.wagerPoints = a.balance),
        () => (me.wagerError = 'Couldn’t load your wager points from Rainbet right now.'),
      ),
  ])
  return {
    items: sortItems(items.filter((i) => !i.hidden)).map(publicItem),
    me,
    orders: user ? await mine(user) : [],
    settings: {
      cooldownDays: settings.cooldownDays,
      wagerCooldownDays: settings.wagerCooldownDays,
      wagerRate: settings.wagerRate,
      season: (({ start, end }) => ({ start, end }))(seasonOf(settings)),
    },
  }
}

async function redeem(user, body, admin) {
  if (!user) throw new InputError('Sign in with Kick to buy from the store.', 401)
  const itemId = String(body.itemId ?? '')
  const note = String(body.note ?? '').trim().replace(/\s+/g, ' ').slice(0, 140)
  const item = (await allItems()).find((i) => i.id === itemId && !i.hidden)
  if (!item) throw new InputError('That item is no longer in the store.', 404)
  if (item.stock === 0) throw new InputError(`${item.name} is sold out.`, 409)
  const store = storeOf(item)
  if (store === 'watch' && !user.kick?.username) throw new InputError('Sign in with Kick: watch points live on your Kick account.', 403)

  // one purchase per cooldown in each store (rejected and cancelled ones don't count); admins aren't limited
  const limits = await readSettings()
  const cooldownDays = store === 'wager' ? limits.wagerCooldownDays : limits.cooldownDays
  if (cooldownDays > 0 && !admin) {
    const last = (await orders()).filter((o) => o.userId === user.id && storeOf(o) === store && (o.status === 'pending' || o.status === 'approved')).sort((a, b) => b.at - a.at)[0]
    const wait = last ? last.at + cooldownDays * DAY - nowSeconds() : 0
    if (wait > 0) {
      const days = Math.ceil(wait / DAY)
      throw new InputError(`You can buy again in ${days} day${days === 1 ? '' : 's'}: one item every ${cooldownDays} days.`, 429)
    }
  }

  if (store === 'wager') return redeemWager(user, item, note)
  const kick = user.kick.username

  let viewer
  try {
    viewer = await getBotrixViewer(kick, true)
  } catch {
    throw new InputError('Couldn’t reach BotRix to check your points. Please try again.', 502)
  }
  const balance = viewer?.points ?? 0
  if (balance < item.cost) throw new InputError(`You need ${fmt(item.cost - balance)} more watch points for ${item.name}.`, 402)

  // hold one from stock, then take the points; if BotRix says no, the stock goes back
  await update(
    ITEMS,
    (list) => {
      const all = list ?? seed()
      const it = all.find((i) => i.id === item.id)
      if (!it || it.hidden) throw new InputError('That item is no longer in the store.', 404)
      if (it.stock === 0) throw new InputError(`${item.name} is sold out.`, 409)
      if (it.stock !== null) it.stock -= 1
      return all
    },
    null,
  )
  try {
    await adjustBotrixPoints(kick, -item.cost)
  } catch (err) {
    await restock(item.id, 1)
    const message = err instanceof Error ? err.message : 'Could not take the points.'
    await log({ store: 'watch', kick, delta: -item.cost, kind: 'redeem', reason: item.name, by: displayName(user), ok: false, error: message })
    throw new InputError(err instanceof BotrixError && err.code === 'insufficient' ? 'You don’t have enough watch points.' : message, 502)
  }
  await log({ store: 'watch', kick, delta: -item.cost, kind: 'redeem', reason: item.name, by: displayName(user), ok: true })

  const row = (await read('players')).find((p) => p.id === user.id)
  const order = {
    id: newId(),
    store: 'watch',
    userId: user.id,
    player: displayName(user),
    kick,
    rainbet: approvedRainbet(row),
    itemId: item.id,
    itemName: item.name,
    itemImage: item.image ?? null,
    cost: item.cost,
    note,
    status: 'pending',
    at: nowSeconds(),
    decidedAt: null,
    decidedBy: null,
    reason: null,
    charged: true,
    refunded: false,
  }
  try {
    await update(ORDERS, (list) => [order, ...list].slice(0, MAX_ORDERS), [])
  } catch (err) {
    // couldn't record it: undo the charge and the stock hold
    await adjustBotrixPoints(kick, item.cost).catch(() => undefined)
    await restock(item.id, 1).catch(() => undefined)
    throw err
  }
  await logActivity({ actor: kick, kind: 'shop', text: `Bought ${item.name} for ${fmt(item.cost)} watch points` })
  return { order: myOrder(order), points: Math.max(0, balance - item.cost), orders: await mine(user) }
}

/**
 * A wager-store purchase: the balance is checked and the order written in one update of the
 * orders table, so two quick clicks can't spend the same points twice.
 */
async function redeemWager(user, item, note) {
  const rainbet = await rainbetOf(user)
  if (!rainbet) throw new InputError('Link your Rainbet username on your profile first: wager points come from your wager under the code.', 403)
  let got
  try {
    got = await wagerSince(rainbet)
  } catch {
    throw new InputError('Couldn’t reach Rainbet to check your wager points. Please try again.', 502)
  }
  // hold one from stock first; it goes back if the points aren't there
  await update(
    ITEMS,
    (list) => {
      const all = list ?? seed()
      const it = all.find((i) => i.id === item.id)
      if (!it || it.hidden) throw new InputError('That item is no longer in the store.', 404)
      if (it.stock === 0) throw new InputError(`${item.name} is sold out.`, 409)
      if (it.stock !== null) it.stock -= 1
      return all
    },
    null,
  )
  const order = {
    id: newId(),
    store: 'wager',
    userId: user.id,
    player: displayName(user),
    kick: user.kick?.username ?? null,
    rainbet,
    itemId: item.id,
    itemName: item.name,
    itemImage: item.image ?? null,
    cost: item.cost,
    note,
    status: 'pending',
    at: nowSeconds(),
    decidedAt: null,
    decidedBy: null,
    reason: null,
    charged: true,
    refunded: false,
  }
  let balance = 0
  try {
    // the adjustments are read before the update (an update can't wait on another table)
    const settingsNow = await readSettings()
    const before = await wagerAccount(rainbet, { got })
    await update(
      ORDERS,
      (list) => {
        balance = before.earned + before.adjust - wagerSpent(list, rainbet.toLowerCase(), seasonOf(settingsNow).startSec)
        if (balance < item.cost) throw new InputError(`You need ${fmt(item.cost - Math.max(0, balance))} more wager points for ${item.name}.`, 402)
        return [order, ...list].slice(0, MAX_ORDERS)
      },
      [],
    )
  } catch (err) {
    await restock(item.id, 1)
    throw err
  }
  await log({ store: 'wager', kick: order.kick, rainbet, delta: -item.cost, kind: 'redeem', reason: item.name, by: displayName(user), ok: true })
  await logActivity({ actor: order.kick ?? rainbet, kind: 'shop', text: `Bought ${item.name} for ${fmt(item.cost)} wager points` })
  return { order: myOrder(order), wagerPoints: Math.max(0, balance - item.cost), orders: await mine(user) }
}

// ---------------------------------------------------------------- routes

export async function handle(req, ctx) {
  const { path, method, user } = ctx
  const body = ctx.body ?? {}
  const isPublic = path === '/api/shop' || path.startsWith('/api/shop/')
  const isAdmin = path.startsWith('/api/admin/shop/')
  if (!isPublic && !isAdmin) return null

  try {
    // ---- the store
    if (path === '/api/shop') {
      if (method !== 'GET') return json(405, { error: 'Use GET.' })
      return json(200, await shopView(user))
    }
    if (path === '/api/shop/redeem') {
      if (method !== 'POST') return json(405, { error: 'Use POST.' })
      const result = await redeem(user, body, ctx.admin)
      const o = result.order
      if (o) {
        const wager = o.store === 'wager'
        notifyAdmins(req, {
          title: `New ${wager ? 'Wager' : 'Watch'} Store order: ${o.itemName}`,
          tab: wager ? 'wager-store' : 'shop',
          color: COLORS.order,
          fields: [
            ['Player', user?.kick?.username ?? displayName(user)],
            [wager ? 'Rainbet' : 'Kick', wager ? await rainbetOf(user).catch(() => null) : user?.kick?.username],
            ['Cost', `${fmt(o.cost)} ${pointsName(o.store)}`],
            ['Note', o.note, false],
          ],
        })
      }
      return json(200, result)
    }
    const cancel = /^\/api\/shop\/orders\/([\w-]{1,40})\/cancel$/.exec(path)
    if (cancel) {
      if (method !== 'POST') return json(405, { error: 'Use POST.' })
      if (!user) throw new InputError('Sign in first.', 401)
      const o = await closeWithRefund(cancel[1], 'cancelled', displayName(user), { ownerId: user.id })
      await logActivity({ actor: displayName(user), kind: 'shop', text: `Cancelled their ${o.itemName} order (points refunded)` })
      const viewer = user.kick && storeOf(o) === 'watch' ? await getBotrixViewer(user.kick.username, true).catch(() => null) : null
      const rb = storeOf(o) === 'wager' ? await rainbetOf(user) : null
      const account = rb ? await wagerAccount(rb).catch(() => null) : null
      return json(200, { orders: await mine(user), points: viewer?.points ?? null, wagerPoints: account?.balance ?? null })
    }
    if (isPublic) return json(404, { error: 'Not found.' })

    // ---- admin (api.js has already checked ctx.admin)
    const admin = displayName(user)

    if (path === '/api/admin/shop/orders') {
      if (method !== 'GET') return json(405, { error: 'Use GET.' })
      const status = ctx.url.searchParams.get('status') || 'all'
      if (status !== 'all' && !STATUSES.includes(status)) throw new InputError('Unknown status.')
      const store = ctx.url.searchParams.get('store') || 'all'
      if (store !== 'all' && !STORES.includes(store)) throw new InputError('Unknown store.')
      return json(200, await adminOrders(status, ctx.url.searchParams.get('q') ?? '', store))
    }
    const decide = /^\/api\/admin\/shop\/orders\/([\w-]{1,40})$/.exec(path)
    if (decide) {
      if (method !== 'POST') return json(405, { error: 'Use POST.' })
      if (body.action === 'approve') {
        let done = null
        await update(
          ORDERS,
          (list) => {
            const o = list.find((x) => x.id === decide[1])
            if (!o) throw new InputError('That order no longer exists.', 404)
            if (o.status !== 'pending') throw new InputError('This order was already handled. Refresh to see it.', 409)
            Object.assign(o, { status: 'approved', decidedAt: nowSeconds(), decidedBy: admin })
            done = o
            return list
          },
          [],
        )
        await logActivity({ actor: admin, kind: 'shop', text: `Delivered ${done.kick}’s ${done.itemName}` })
      } else if (body.action === 'reject') {
        const o = await closeWithRefund(decide[1], 'rejected', admin, { reason: String(body.reason ?? '') })
        await logActivity({ actor: admin, kind: 'shop', text: `Rejected ${o.kick}’s ${o.itemName} (points refunded)${body.reason ? `: ${String(body.reason).slice(0, 120)}` : ''}` })
      } else throw new InputError('Approve or reject.')
      return json(200, await adminOrders('all'))
    }

    if (path === '/api/admin/shop/items') {
      if (method === 'GET') {
        const settings = await readSettings()
        return json(200, { items: sortItems(await allItems()), settings, season: seasonOf(settings), canChange: botrixCanChange() })
      }
      if (method !== 'POST') return json(405, { error: 'Use GET or POST.' })
      const fields = itemFields(body, false)
      const base = fields.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'item'
      let item = null
      const items = await update(
        ITEMS,
        (list) => {
          const all = list ?? seed()
          item = { id: `${base}-${randomBytes(2).toString('hex')}`, hidden: false, store: 'watch', order: Math.max(-1, ...all.map((i) => i.order ?? 0)) + 1, ...fields }
          return [...all, item]
        },
        null,
      )
      await logActivity({ actor: admin, kind: 'shop', text: `Added ${item.name} to the ${item.store ?? 'watch'} store (${fmt(item.cost)} ${pointsName(item.store)})` })
      return json(200, { item, items: sortItems(items) })
    }
    const itemRoute = /^\/api\/admin\/shop\/items\/([\w-]{1,60})(?:\/(remove))?$/.exec(path)
    if (itemRoute) {
      if (method !== 'POST') return json(405, { error: 'Use POST.' })
      const [, id, action] = itemRoute
      const changes = action ? null : itemFields(body, true)
      let item = null
      const items = await update(
        ITEMS,
        (list) => {
          const all = list ?? seed()
          const i = all.findIndex((x) => x.id === id)
          if (i < 0) throw new InputError('That item is no longer in the store.', 404)
          item = all[i]
          if (action === 'remove') return all.filter((x) => x.id !== id)
          item = { ...all[i], ...changes }
          all[i] = item
          return all
        },
        null,
      )
      await logActivity({ actor: admin, kind: 'shop', text: action === 'remove' ? `Removed ${item.name} from the store` : `Edited ${item.name} in the store`, fold: !action })
      return json(200, { item: action ? null : item, items: sortItems(items) })
    }

    if (path === '/api/admin/shop/points/log') return json(200, { log: (await read(LOG, [])).slice(0, 300) })

    if (path === '/api/admin/shop/points') {
      if (method === 'GET') {
        const name = String(ctx.url.searchParams.get('name') ?? '').trim().replace(/^@/, '')
        if (!KICK_NAME.test(name)) throw new InputError('Enter a Kick username.')
        let viewer
        try {
          viewer = await getBotrixViewer(name, true)
        } catch {
          throw new InputError('Couldn’t reach BotRix.', 502)
        }
        const lower = name.toLowerCase()
        const p = (await read('players')).find((x) => x.kick?.username?.toLowerCase() === lower) ?? null
        const player = p ? { id: p.id, name: p.name, avatar: p.avatar ?? null, rainbet: approvedRainbet(p) } : null
        const history = (await read(LOG, [])).filter((e) => storeOf(e) === 'watch' && String(e.kick ?? '').toLowerCase() === lower).slice(0, 50)
        return json(200, { viewer, player, history })
      }
      if (method !== 'POST') return json(405, { error: 'Use GET or POST.' })
      const name = String(body.name ?? '').trim().replace(/^@/, '')
      const delta = Number(body.delta)
      const reason = String(body.reason ?? '').trim().slice(0, 120)
      if (!KICK_NAME.test(name)) throw new InputError('Enter a Kick username.')
      if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 10_000_000) throw new InputError('Enter a whole number of points (up to 10,000,000).')
      if (!reason) throw new InputError('Say why (it goes in the log).')
      try {
        await adjustBotrixPoints(name, delta)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'BotRix didn’t make the change.'
        await log({ store: 'watch', kick: name, delta, kind: 'admin', reason, by: admin, ok: false, error: message })
        throw new InputError(message, 502)
      }
      await log({ store: 'watch', kick: name, delta, kind: 'admin', reason, by: admin, ok: true })
      await logActivity({ actor: admin, kind: 'shop', text: `${delta > 0 ? 'Gave' : 'Took'} ${fmt(Math.abs(delta))} watch points ${delta > 0 ? 'to' : 'from'} ${name}: ${reason}` })
      // BotRix's leaderboard can lag a moment behind the change
      const viewer = await getBotrixViewer(name, true).catch(() => null)
      return json(200, { viewer, history: (await read(LOG, [])).filter((e) => storeOf(e) === 'watch' && String(e.kick ?? '').toLowerCase() === name.toLowerCase()).slice(0, 50) })
    }

    if (path === '/api/admin/shop/wager-points') {
      const history = async (lower) => (await read(LOG, [])).filter((e) => storeOf(e) === 'wager' && String(e.rainbet ?? '').toLowerCase() === lower).slice(0, 50)
      if (method === 'GET') {
        const name = String(ctx.url.searchParams.get('name') ?? '').trim()
        if (!name || name.length > 40 || /[\s<>]/.test(name)) throw new InputError('Enter a Rainbet username.')
        let account
        try {
          account = await wagerAccount(name)
        } catch {
          throw new InputError('Couldn’t reach Rainbet.', 502)
        }
        const lower = name.toLowerCase()
        const p = (await read('players', [])).find((x) => approvedRainbet(x)?.toLowerCase() === lower) ?? null
        const player = p ? { id: p.id, name: p.name, avatar: p.avatar ?? null, kick: p.kick?.username ?? null } : null
        return json(200, { account, player, history: await history(lower) })
      }
      if (method !== 'POST') return json(405, { error: 'Use GET or POST.' })
      const name = String(body.name ?? '').trim()
      const delta = Number(body.delta)
      const reason = String(body.reason ?? '').trim().slice(0, 120)
      if (!name || name.length > 40 || /[\s<>]/.test(name)) throw new InputError('Enter a Rainbet username.')
      if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 10_000_000) throw new InputError('Enter a whole number of points (up to 10,000,000).')
      if (!reason) throw new InputError('Say why (it goes in the log).')
      const key = name.toLowerCase()
      await update(WADJ, (list) => [{ id: newId(), key, name, delta, reason, by: admin, at: nowSeconds() }, ...list].slice(0, 20_000), [])
      await log({ store: 'wager', kick: null, rainbet: name, delta, kind: 'admin', reason, by: admin, ok: true })
      await logActivity({ actor: admin, kind: 'shop', text: `${delta > 0 ? 'Gave' : 'Took'} ${fmt(Math.abs(delta))} wager points ${delta > 0 ? 'to' : 'from'} ${name}: ${reason}` })
      return json(200, { account: await wagerAccount(name).catch(() => null), history: await history(key) })
    }

    if (path === '/api/admin/shop/settings') {
      if (method === 'POST') {
        const next = {}
        if ('cooldownDays' in body) {
          const days = Number(body.cooldownDays)
          if (!Number.isInteger(days) || days < 0 || days > 365) throw new InputError('Cooldown is 0 to 365 days.')
          next.cooldownDays = days
        }
        if ('wagerRate' in body) {
          const rate = Number(body.wagerRate)
          if (!Number.isFinite(rate) || rate < 0 || rate > 1000) throw new InputError('Wager points per $1: a number from 0 to 1,000.')
          next.wagerRate = Math.round(rate * 1000) / 1000
        }
        if ('wagerCooldownDays' in body) {
          const days = Number(body.wagerCooldownDays)
          if (!Number.isInteger(days) || days < 0 || days > 365) throw new InputError('Cooldown is 0 to 365 days.')
          next.wagerCooldownDays = days
        }
        if ('seasonMonths' in body) {
          const m = Number(body.seasonMonths)
          if (!Number.isInteger(m) || m < 0 || m > 24) throw new InputError('Points expire every 1 to 24 months (0: never).')
          next.seasonMonths = m
        }
        if ('wagerSince' in body) {
          const d = String(body.wagerSince ?? '')
          if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))) throw new InputError('Counting from: a date (YYYY-MM-DD).')
          next.wagerSince = d
        }
        const saved = await update(SETTINGS, (cur) => ({ ...DEFAULT_SETTINGS, ...cur, ...next }), DEFAULT_SETTINGS)
        const parts = []
        if ('cooldownDays' in next) parts.push(next.cooldownDays ? `cooldown one item every ${next.cooldownDays} days` : 'cooldown off')
        if ('wagerCooldownDays' in next) parts.push(next.wagerCooldownDays ? `wager store: one item every ${next.wagerCooldownDays} days` : 'wager store cooldown off')
        if ('wagerRate' in next || 'wagerSince' in next || 'seasonMonths' in next)
          parts.push(`wager points ${saved.wagerRate} per $1, ${saved.seasonMonths ? `expire every ${saved.seasonMonths} months` : 'never expire'} from ${saved.wagerSince}`)
        if (parts.length) await logActivity({ actor: admin, kind: 'shop', text: `Store settings: ${parts.join(', ')}` })
      }
      const settings = await readSettings()
      return json(200, { settings, season: seasonOf(settings) })
    }

    return json(404, { error: 'Not found.' })
  } catch (err) {
    if (err instanceof InputError) return json(err.status, { error: err.message })
    throw err
  }
}
