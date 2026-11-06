import { useEffect, useState } from 'react'
import { championOf, currentMatch, fmtMult, matchReady, matchScored, matchesInRound, roundLabel, roundsIn, winnerOf } from '../bracket'
import './Bracket.css'

// The tournament bracket, drawn once for every audience:
//   mode 'view'     the public page (site rows)
//   mode 'overlay'  the OBS overlay (flat cards, compact)
//   mode 'edit'     the admin: names, slots and multipliers typed straight into the
//                   cards, Decide / Undo on each card's foot
// Geometry is computed, not laid out by CSS: each round's cards sit centred
// between the two that feed them (which depends on 2^round), and the SVG wires
// use the same numbers, so the lines always meet the cards.

const GEOMETRY = {
  // rowH: one player row · footH: the card's action strip · colW/colGap: columns · baseGap: first-round gap
  view: { rowH: 46, footH: 0, colW: 180, colGap: 30, baseGap: 14, labelH: 30, champH: 74 },
  edit: { rowH: 60, footH: 30, colW: 284, colGap: 40, baseGap: 14, labelH: 30, champH: 74 },
  overlay: { rowH: 34, footH: 0, colW: 190, colGap: 28, baseGap: 10, labelH: 24, champH: 62 },
}

/** Overlay cards shrink for big brackets so 16 and 32 still fit a stream canvas */
function geometryFor(mode, rounds) {
  const g = GEOMETRY[mode] ?? GEOMETRY.view
  if (mode !== 'overlay' || rounds <= 3) return g
  return rounds === 4 ? { ...g, rowH: 28, colW: 172, colGap: 24, baseGap: 8 } : { ...g, rowH: 22, colW: 150, colGap: 20, baseGap: 6 }
}

const cardH = (g) => g.rowH * 2 + 1 + g.footH
const pitch = (g, r) => (cardH(g) + g.baseGap) * 2 ** r
const cardTop = (g, r, i) => g.labelH + (pitch(g, r) - pitch(g, 0)) / 2 + i * pitch(g, r)
const cardMid = (g, r, i) => cardTop(g, r, i) + (g.rowH * 2 + 1) / 2
const rowMid = (g, r, i, row) => cardTop(g, r, i) + (row === 0 ? g.rowH / 2 : g.rowH + 1 + g.rowH / 2)
const colX = (g, r) => r * (g.colW + g.colGap)

/** A wire with rounded corners: right, down/up, right */
function wirePath(x1, y1, xm, y2, x2) {
  const dy = y2 - y1
  const rad = Math.min(8, Math.abs(dy) / 2, (xm - x1) / 2)
  if (Math.abs(dy) < 0.5) return `M${x1},${y1} H${x2}`
  const s = Math.sign(dy)
  return `M${x1},${y1} H${xm - rad} Q${xm},${y1} ${xm},${y1 + s * rad} V${y2 - s * rad} Q${xm},${y2} ${xm + rad},${y2} H${x2}`
}

function Wires({ matches, rounds, g, width, height, champion }) {
  const lines = []
  for (let r = 0; r < rounds - 1; r++) {
    const x1 = colX(g, r) + g.colW
    const x2 = colX(g, r + 1)
    const xm = x1 + g.colGap / 2
    matchesInRound(matches, r).forEach((m, i) => {
      const target = rowMid(g, r + 1, Math.floor(i / 2), i % 2)
      lines.push({ key: m.id, d: wirePath(x1, cardMid(g, r, i), xm, target, x2), lit: Boolean(m.winner) })
    })
  }
  const y = cardMid(g, rounds - 1, 0)
  const xf = colX(g, rounds - 1) + g.colW
  lines.push({ key: 'final', d: `M${xf},${y} H${colX(g, rounds)}`, lit: Boolean(champion), gold: true })
  // lit wires drawn last so they sit on top
  lines.sort((a, b) => Number(a.lit) - Number(b.lit))
  return (
    <svg className="br-wires" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {lines.map((l) => (
        <path key={l.key} d={l.d} pathLength="1" className={l.lit ? (l.gold ? 'is-gold' : 'is-lit') : undefined} />
      ))}
    </svg>
  )
}

/** Multiplier field that keeps what's typed ("1.") and follows outside changes (a reset) */
function MultInput({ value, label, onChange }) {
  const [text, setText] = useState(value === null ? '' : String(value))
  useEffect(() => {
    setText((t) => {
      const typed = Number(t.replace(/,/g, ''))
      if (value === null) return t.trim() !== '' && Number.isFinite(typed) ? '' : t
      return typed === value ? t : String(value)
    })
  }, [value])
  return (
    <span className="br-mult-in" onClick={(e) => e.stopPropagation()}>
      <input
        value={text}
        inputMode="decimal"
        placeholder="0"
        aria-label={label}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.,]/g, '')
          setText(t)
          const n = Number(t.replace(/,/g, ''))
          onChange(t.trim() === '' || !Number.isFinite(n) ? null : n)
        }}
      />
      <span aria-hidden="true">×</span>
    </span>
  )
}

function Art({ player, empty }) {
  if (player.image) return <img className="br-art" src={player.image} alt="" loading="lazy" />
  return <span className="br-art is-blank">{empty ? '' : player.name.trim().charAt(0).toUpperCase()}</span>
}

/** Admin: the player's slot, as its name (click to change, × to clear) or the search */
function SlotCell({ player, label, onPlayer, SlotPicker }) {
  const [editing, setEditing] = useState(false)
  if (!SlotPicker) return <span className="br-slot">{player.slot || 'Slot to pick'}</span>
  if (player.slot && !editing) {
    return (
      <span className="br-slot-set">
        <button type="button" className="br-slot-btn" onClick={() => setEditing(true)} title="Change slot">
          {player.slot}
        </button>
        <button
          type="button"
          className="br-slot-x"
          aria-label={`Clear ${label}`}
          onClick={() => onPlayer({ slot: '', slug: undefined, provider: undefined, image: undefined })}
        >
          ×
        </button>
      </span>
    )
  }
  return (
    <SlotPicker
      compact
      floating
      autoFocus={editing}
      ariaLabel={label}
      placeholder={player.slot ? player.slot : 'Pick slot…'}
      onCancel={() => setEditing(false)}
      onPick={(g) => {
        onPlayer({ slot: g.name, slug: g.slug ?? undefined, provider: g.provider ?? undefined, image: g.image ?? undefined })
        setEditing(false)
      }}
    />
  )
}

function Row({ match, which, g, edit, handlers }) {
  const player = which === 1 ? match.player1 : match.player2
  const mult = which === 1 ? match.mult1 : match.mult2
  const side = which === 1 ? 'p1' : 'p2'
  const state = !match.winner ? 'open' : match.winner === side ? 'won' : 'lost'
  const empty = !player.name.trim()
  const open = edit && !match.winner
  // first-round names are typed in; later rounds are filled by results
  const nameIn = open && match.round === 0 && handlers?.onPlayer
  const slotIn = open && !empty && handlers?.onPlayer
  const onPlayer = (patch) => handlers.onPlayer(match.id, which, patch)
  const who = empty ? (match.round === 0 ? `Player ${which}` : 'TBD') : player.name

  return (
    <div className={`br-row is-${state}${empty ? ' is-empty' : ''}`} style={{ height: g.rowH }}>
      <Art player={player} empty={empty} />
      <span className="br-who">
        {nameIn ? (
          <input
            className="br-name-in"
            value={player.name}
            placeholder={`Player ${which}`}
            maxLength={40}
            autoComplete="off"
            spellCheck={false}
            aria-label={`Match ${match.position + 1}, player ${which} name`}
            onChange={(e) => onPlayer({ name: e.target.value.slice(0, 40) })}
          />
        ) : (
          <span className="br-name">{who}</span>
        )}
        {slotIn ? (
          <SlotCell player={player} label={`${player.name}'s slot`} onPlayer={onPlayer} SlotPicker={handlers.SlotPicker} />
        ) : (
          g.rowH >= 28 && <span className="br-slot">{empty ? '' : player.slot || 'Slot to pick'}</span>
        )}
      </span>
      {open && !empty ? (
        <MultInput value={mult} label={`Multiplier for ${player.name}`} onChange={(v) => handlers.onMult(match.id, which, v)} />
      ) : (
        <span className="br-mult">{mult === null ? '' : fmtMult(mult)}</span>
      )}
    </div>
  )
}

function Card({ match, g, top, left, edit, live, handlers }) {
  const ready = matchReady(match)
  const scored = matchScored(match)
  const cls = ['br-card', match.winner && 'is-done', live && 'is-live', !ready && 'is-waiting'].filter(Boolean).join(' ')

  return (
    <div className={cls} style={{ top, left, width: g.colW, height: cardH(g) }}>
      <Row match={match} which={1} g={g} edit={edit} handlers={handlers} />
      <span className="br-rule" aria-hidden="true" />
      <Row match={match} which={2} g={g} edit={edit} handlers={handlers} />
      {live && !edit && <span className="br-live-tag">Live</span>}
      {g.footH > 0 && (
        <div className="br-foot" style={{ height: g.footH }}>
          {match.winner ? (
            <button type="button" className="br-foot-btn is-undo" onClick={() => handlers.onReset(match.id)}>
              {winnerOf(match).name} won · undo
            </button>
          ) : ready && scored ? (
            <button type="button" className="br-foot-btn" onClick={() => handlers.onDecide(match.id)}>
              Decide winner
            </button>
          ) : (
            <span className="br-foot-note">{!ready ? (match.round === 0 ? 'Enter both players' : 'Awaiting players') : 'Enter both multipliers'}</span>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Single-elimination bracket with wires.
 *   <Bracket matches={t.matches} />                                    public page
 *   <Bracket matches={t.matches} mode="overlay" />                     stream overlay
 *   <Bracket matches={t.matches} mode="edit" handlers={{ onPlayer, onMult, onDecide, onReset, SlotPicker }} />
 *     onPlayer(matchId, which, patch) edits a player in place (first-round names, any
 *     undecided player's slot). SlotPicker is passed in so the public bundle never
 *     loads the admin's slot search.
 */
export default function Bracket({ matches, mode = 'view', handlers }) {
  const rounds = roundsIn(matches)
  if (!rounds) return null
  const edit = mode === 'edit'
  const g = geometryFor(mode, rounds)
  const champion = championOf(matches)
  const live = currentMatch(matches)?.id ?? null
  const first = 2 ** (rounds - 1)
  const width = colX(g, rounds) + g.colW
  const height = g.labelH + first * cardH(g) + (first - 1) * g.baseGap
  const finalMid = cardMid(g, rounds - 1, 0)

  return (
    <div
      className={`br is-${mode}${g.rowH < 28 ? ' is-tiny' : ''}${champion ? ' has-champion' : ''}`}
      style={{ '--br-art-h': `${Math.round(g.rowH * 0.72)}px` }}
    >
      <div className="br-canvas" style={{ width, height }}>
        <Wires matches={matches} rounds={rounds} g={g} width={width} height={height} champion={champion} />
        {Array.from({ length: rounds }, (_, r) => (
          <p key={`l${r}`} className="br-round" style={{ left: colX(g, r), width: g.colW, height: g.labelH }}>
            {roundLabel(r, rounds)}
          </p>
        ))}
        <p className="br-round is-champ" style={{ left: colX(g, rounds), width: g.colW, height: g.labelH }}>
          Champion
        </p>
        {matches.map((m) => (
          <Card
            key={m.id}
            match={m}
            g={g}
            top={cardTop(g, m.round, m.position)}
            left={colX(g, m.round)}
            edit={edit}
            live={m.id === live}
            handlers={handlers}
          />
        ))}
        <div
          className={`br-champ${champion ? ' is-crowned' : ''}`}
          style={{ top: finalMid - g.champH / 2, left: colX(g, rounds), width: g.colW, height: g.champH }}
        >
          {champion ? (
            <>
              <Art player={champion} />
              <span className="br-who">
                <span className="br-champ-label">Champion</span>
                <span className="br-champ-name">{champion.name}</span>
                {champion.slot && g.rowH >= 28 && <span className="br-slot">{champion.slot}</span>}
              </span>
            </>
          ) : (
            <span className="br-who">
              <span className="br-champ-label">Champion</span>
              <span className="br-champ-name is-tbd">To be decided</span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
