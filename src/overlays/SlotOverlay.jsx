import { useEffect, useRef, useState } from 'react'
import SlotReel from '../components/SlotReel'
import { usePolled } from '../hooks/usePolled'
import { Foot, Pill, Plate, PlateHead } from './kit'

// /overlay/slots: the slot picker. A roll made while the overlay is up spins the reel
// (built by the server, so it lands on the real pick) and settles on a gold-framed
// card. A roll made before it loaded just shows. Hidden until the first roll.

const POLL = 1500

export default function SlotOverlay() {
  const { data } = usePolled('/api/events/slotpick', POLL)
  const draw = data?.draw ?? null
  const seen = useRef(undefined) // the draw id in the first answer (undefined until then)
  const [spinId, setSpinId] = useState(null)

  const drawId = draw?.id ?? null
  useEffect(() => {
    if (!data) return
    if (seen.current === undefined) {
      seen.current = drawId // made before load: shown, not played
      return
    }
    if (drawId && drawId !== seen.current) {
      seen.current = drawId
      setSpinId(drawId)
    }
  }, [data, drawId])

  if (!draw) return null
  const spinning = spinId === draw.id
  const slot = draw.slot

  return (
    <Plate width={480}>
      <PlateHead
        kicker="TEGENS · Slot picker"
        title={spinning ? 'Picking a slot…' : slot.name}
        right={spinning ? <Pill tone="live">Spinning</Pill> : <Pill tone="gold">Picked</Pill>}
      />
      <SlotReel key={draw.id} draw={draw} play={spinning} onDone={() => setSpinId(null)} />
      <Foot>
        <span>{spinning ? 'Good luck…' : slot.provider || 'Next up'}</span>
        <span>
          <b>{draw.reel.length}</b> slots in the spin
        </span>
      </Foot>
    </Plate>
  )
}
