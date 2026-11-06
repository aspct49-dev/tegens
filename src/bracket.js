// Single-elimination slot tournaments: the bracket maths, shared by the server
// (server/features/tournaments.js) and the browser (admin, public page, overlay).
// Plain JS, no imports, so Node and Vite load the same file.
//
// A tournament has `size` players (4, 8, 16 or 32), so log2(size) rounds. Each
// match is `${round}-${position}`; round 0 is paired in entry order (seed 0 v 1,
// 2 v 3 …). Match (r, p) feeds (r + 1, p ÷ 2): even positions the top side,
// odd the bottom.
//
//   player   { name, slot, slug?, provider?, image? }
//   match    { id, round, position, player1, player2, mult1, mult2, winner }
//            mult: the multiplier the player hit, null until entered (0 is real)
//            winner: 'p1' | 'p2' | null. Deciding a match always picks the higher
//            multiplier; a tie goes to player 1 (reset the match to re-spin).

export const BRACKET_SIZES = [4, 8, 16, 32]
export const EMPTY_PLAYER = Object.freeze({ name: '', slot: '' })

export const isBracketSize = (n) => BRACKET_SIZES.includes(n)
export const roundsIn = (matches) => matches.reduce((max, m) => Math.max(max, m.round + 1), 0)
export const matchesInRound = (matches, round) => matches.filter((m) => m.round === round).sort((a, b) => a.position - b.position)
export const matchReady = (m) => m.player1.name.trim() !== '' && m.player2.name.trim() !== ''
export const matchScored = (m) => m.mult1 !== null && m.mult2 !== null
const blank = () => ({ ...EMPTY_PLAYER })

/** The match a match's winner moves into (null for the final) */
export const childId = (m, rounds) => (m.round + 1 >= rounds ? null : `${m.round + 1}-${Math.floor(m.position / 2)}`)

/** The side that wins on the multipliers: higher goes through, a tie is player 1's */
export const sideByMultiplier = (m) => (m.mult1 >= m.mult2 ? 'p1' : 'p2')

export const winnerOf = (m) => (m.winner === 'p1' ? m.player1 : m.winner === 'p2' ? m.player2 : null)
export const loserOf = (m) => (m.winner === 'p1' ? m.player2 : m.winner === 'p2' ? m.player1 : null)

/** An empty bracket; `players` (optional) fill round 0 in order */
export function buildBracket(size, players = []) {
  const rounds = Math.log2(size)
  const matches = []
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < size / 2 ** (r + 1); i++) {
      matches.push({
        id: `${r}-${i}`,
        round: r,
        position: i,
        player1: r === 0 ? { ...(players[i * 2] ?? EMPTY_PLAYER) } : blank(),
        player2: r === 0 ? { ...(players[i * 2 + 1] ?? EMPTY_PLAYER) } : blank(),
        mult1: null,
        mult2: null,
        winner: null,
      })
    }
  }
  return matches
}

/** Round-0 entrants in seed order (seed i plays in match i ÷ 2) */
export function seedsOf(matches) {
  return matchesInRound(matches, 0).flatMap((m) => [m.player1, m.player2])
}

/** Seed i's first-round match id and side */
export const seedSlot = (i) => ({ matchId: `0-${Math.floor(i / 2)}`, which: i % 2 === 0 ? 1 : 2 })

export function updatePlayer(matches, matchId, which, patch) {
  const key = which === 1 ? 'player1' : 'player2'
  return matches.map((m) => (m.id === matchId ? { ...m, [key]: { ...m[key], ...patch } } : m))
}

export function setMultiplier(matches, matchId, which, value) {
  return matches.map((m) => (m.id === matchId ? { ...m, [which === 1 ? 'mult1' : 'mult2']: value } : m))
}

/** Decide a match on its multipliers and carry the winner into the next round */
export function decideMatch(matches, matchId) {
  const m = matches.find((x) => x.id === matchId)
  if (!m || m.winner || !matchReady(m) || !matchScored(m)) return matches
  return settle(matches.map((x) => (x.id === matchId ? { ...x, winner: sideByMultiplier(x) } : x)))
}

/** Undo a decided match and everything it fed into later rounds */
export function resetMatch(matches, matchId) {
  return settle(matches.map((m) => (m.id === matchId ? { ...m, winner: null } : m)))
}

/**
 * Make a bracket consistent, round by round: a later round's players are the
 * winners of the matches feeding it (a side whose player changes loses its
 * multiplier and the match its result), and a result only stands on a ready,
 * fully scored match, always for the higher multiplier. Resetting a match is
 * just clearing its winner and settling: every round it fed unwinds.
 * Players keep the slot they had, unless the admin already picked another one
 * for this match (a later round can be played on a different slot).
 */
export function settle(input) {
  const rounds = roundsIn(input)
  const byId = new Map(input.map((m) => [m.id, { ...m }]))
  for (let r = 0; r < rounds; r++) {
    for (const m of [...byId.values()].filter((x) => x.round === r).sort((a, b) => a.position - b.position)) {
      if (r > 0) {
        for (const [which, feeder] of [[1, byId.get(`${r - 1}-${m.position * 2}`)], [2, byId.get(`${r - 1}-${m.position * 2 + 1}`)]]) {
          const key = which === 1 ? 'player1' : 'player2'
          const multKey = which === 1 ? 'mult1' : 'mult2'
          const from = feeder ? winnerOf(feeder) : null
          const current = m[key]
          if (!from) {
            if (current.name || current.slot || m[multKey] !== null) {
              m[key] = blank()
              m[multKey] = null
              m.winner = null
            }
          } else if (current.name !== from.name) {
            // a different player now comes through: start their side fresh
            m[key] = { ...from }
            m[multKey] = null
            m.winner = null
          } else if (!current.slot && from.slot) {
            m[key] = { ...from }
          }
        }
      }
      if (m.winner && (!matchReady(m) || !matchScored(m))) m.winner = null
      if (m.winner) m.winner = sideByMultiplier(m)
    }
  }
  return input.map((m) => byId.get(m.id))
}

export function championOf(matches) {
  const rounds = roundsIn(matches)
  const final = matches.find((m) => m.round === rounds - 1)
  return final ? winnerOf(final) : null
}

/** The next match to play: the earliest ready, undecided one (null when none) */
export function currentMatch(matches) {
  return [...matches].sort((a, b) => a.round - b.round || a.position - b.position).find((m) => !m.winner && matchReady(m)) ?? null
}

export function roundLabel(round, rounds) {
  const fromEnd = rounds - 1 - round
  if (fromEnd === 0) return 'Final'
  if (fromEnd === 1) return 'Semi-finals'
  if (fromEnd === 2) return 'Quarter-finals'
  if (fromEnd === 3) return 'Round of 16'
  return `Round of ${2 ** (rounds - round)}`
}

export const decidedCount = (matches) => matches.filter((m) => m.winner).length

/** "12.5×" / "1,250×" */
export const fmtMult = (n) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? '—'
    : `${n.toLocaleString('en-US', { maximumFractionDigits: n >= 1000 ? 0 : 2 })}×`
