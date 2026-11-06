import { usePolled } from '../hooks/usePolled'
import { Foot, Pill, Plate, PlateHead, Well } from './kit'
import './calls-overlay.css'
import VipBadge from '../components/VipBadge'

// /overlay/calls: slot calls (everyone, or VIPs only: admin → Slot Calls). The call being played (admin → Slot Calls) with
// its slot art, name and caller, and what it paid once recorded; the next few calls
// underneath. Hidden when calls are closed and nothing is queued.

const POLL = 1500
const usd = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function CallsOverlay() {
  const { data } = usePolled('/api/events/calls', POLL)
  if (!data) return null
  const { current, next, waiting, open, vipOnly } = data
  const who = vipOnly ? 'VIPs' : 'Chat'
  if (!open && !current && !next.length) return null
  const paid = current?.win != null

  return (
    <Plate width={460}>
      <PlateHead
        kicker={vipOnly ? 'TEGENS · VIP slot calls' : 'TEGENS · Slot calls'}
        title={current ? current.slot.name : 'Slot calls'}
        right={current ? paid ? <Pill tone="gold">Paid</Pill> : <Pill tone="live">Playing</Pill> : open ? <Pill tone="live">Open</Pill> : <Pill>Closed</Pill>}
      />

      {current ? (
        <Well className={`ovc-now${paid ? ' is-paid' : ''}`} key={current.id}>
          {current.slot.image ? <img className="ovc-art" src={current.slot.image} width="108" height="144" alt="" /> : <span className="ovc-art is-empty">{current.slot.name}</span>}
          <div className="ovc-now-text">
            <span className="ovc-by">
              Called by <b>{current.username}</b>
              {current.vip && <VipBadge force />}
            </span>
            <span className="ovc-name">{current.slot.name}</span>
            {current.slot.provider && <span className="ovc-prov">{current.slot.provider}</span>}
            {paid && (
              <span className="ovc-win">
                {usd(current.win)}
                {current.bet ? <span className="ovc-x"> · {(Math.round((current.win / current.bet) * 100) / 100).toLocaleString('en-US')}x</span> : null}
              </span>
            )}
          </div>
        </Well>
      ) : (
        <Well className="ovc-idle">
          <span className="ovc-idle-line">
            {who}: type <span className="ovc-cmd">!call slot name</span>
          </span>
        </Well>
      )}

      {next.length > 0 && (
        <div className="ovc-next">
          <span className="ovc-next-label">Next up</span>
          {next.slice(0, 3).map((c) => (
            <span key={c.id} className="ovc-next-row">
              {c.slot.image ? <img src={c.slot.image} width="24" height="32" alt="" /> : <span className="ovc-next-noart" />}
              <span className="ovc-next-name">{c.slot.name}</span>
              <span className="ovc-next-by">
                {c.username}
                {c.vip && <VipBadge force />}
              </span>
            </span>
          ))}
        </div>
      )}

      <Foot>
        <span>
          <b>{waiting}</b> {waiting === 1 ? 'call' : 'calls'} waiting
        </span>
        <span>{open ? `${who} calls with !call` : 'Calls closed'}</span>
      </Foot>
    </Plate>
  )
}
