import { championOf, currentMatch, decidedCount, fmtMult, roundLabel, roundsIn } from '../bracket'
import Bracket from '../components/Bracket'
import { usePolled } from '../hooks/usePolled'
import { Foot, Pill, Plate, PlateHead, SlotArt, Well } from './kit'
import './tournament.css'

// /overlay/tournament: the live tournament as a broadcast graphic. A "now
// playing" strip for the next match (both players, slots, multipliers), the
// whole bracket under it with that match outlined, and a gold champion reveal once
// the final is decided.
//   ?view=match    only the now-playing strip / champion reveal
//   ?view=bracket  only the bracket
//   ?id=<id>       a specific (published) tournament instead of the current one

export default function TournamentOverlay({ params }) {
  const { data } = usePolled('/api/events/tournaments', 3000)
  if (!data) return null
  const id = params?.get('id')
  const view = params?.get('view') ?? 'full'
  const t = id ? data.tournaments.find((x) => x.id === id) : (data.current ?? data.tournaments[0])

  if (!t) {
    return (
      <Plate className="tov is-idle">
        <PlateHead kicker="Slot tournament" title="No tournament live" right={<Pill>Soon</Pill>} />
      </Plate>
    )
  }

  const rounds = roundsIn(t.matches)
  const champion = championOf(t.matches)
  const next = currentMatch(t.matches)
  const stage = champion ? 'Champion' : next ? roundLabel(next.round, rounds) : 'Waiting'
  const showTop = view !== 'bracket'
  const showBracket = view !== 'match'

  return (
    <Plate className={`tov${champion ? ' is-complete' : ''} is-${view}`}>
      <PlateHead
        kicker={t.prize ? `Slot tournament · ${t.prize}` : 'Slot tournament'}
        title={t.name}
        right={champion ? <Pill tone="gold">Champion</Pill> : <Pill tone="live">{stage}</Pill>}
      />
      {showTop && (champion ? <ChampionReveal player={champion} prize={t.prize} /> : next && <NowPlaying match={next} label={stage} />)}
      {showBracket && (
        <Well className="tov-bracket">
          <Bracket matches={t.matches} mode="overlay" />
        </Well>
      )}
      <Foot>
        <span>
          {t.size} players · <b>{decidedCount(t.matches)}</b>/{t.matches.length} played
        </span>
        <span>
          {champion ? (
            <>
              Won by <b className="tov-gold">{champion.name}</b>
            </>
          ) : (
            <>Higher multiplier goes through</>
          )}
        </span>
      </Foot>
    </Plate>
  )
}

function Side({ player, mult, align }) {
  return (
    <div className={`tov-side is-${align}`}>
      <SlotArt src={player.image} size={64} />
      <div className="tov-side-text">
        <span className="tov-side-name">{player.name}</span>
        <span className="tov-side-slot">{player.slot || 'Slot to pick'}</span>
      </div>
      <span className={`tov-side-mult${mult === null ? ' is-empty' : ''}`}>{mult === null ? '—' : fmtMult(mult)}</span>
    </div>
  )
}

function NowPlaying({ match, label }) {
  return (
    <Well className="tov-now">
      <span className="tov-now-label">
        <span className="ov-dot" /> Now playing · {label}
      </span>
      {/* keyed by match: a new match slides in */}
      <div className="tov-vs" key={match.id}>
        <Side player={match.player1} mult={match.mult1} align="left" />
        <span className="tov-vs-mark">vs</span>
        <Side player={match.player2} mult={match.mult2} align="right" />
      </div>
    </Well>
  )
}

function ChampionReveal({ player, prize }) {
  return (
    <Well className="tov-champ" key={player.name}>
      <SlotArt src={player.image} size={84} />
      <div className="tov-champ-text">
        <span className="tov-champ-kicker">Tournament champion</span>
        <span className="ov-hero is-gold tov-champ-name">{player.name}</span>
        <span className="tov-champ-sub">
          {player.slot}
          {prize ? (
            <>
              {player.slot ? ' · ' : ''}wins <b>{prize}</b>
            </>
          ) : null}
        </span>
      </div>
    </Well>
  )
}
