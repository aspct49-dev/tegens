import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { loadSlotCatalog } from '../slotCatalog'

// Search the slot catalog (public/slots.json: ~9,500 games with art) and pick one.
// onPick({ name, slug, provider, image }). Typing a name that isn't in the list
// and pressing Enter picks it as a custom game (no art).
//
// `floating` draws the result list in a fixed layer on <body>, for pickers that
// live inside something that clips (the bracket's cards scroll and hide overflow).
// `compact` is the small inline variant used inside the bracket.

let catalog = null
async function loadCatalog() {
  // searched by lower-case name
  catalog ??= (await loadSlotCatalog()).games.map((g) => ({ name: g.name, slug: g.slug, provider: g.provider, image: g.image, key: g.name.toLowerCase() }))
  return catalog
}

export default function SlotPicker({ onPick, onCancel, placeholder = 'Search slots…', autoFocus, floating = false, compact = false, ariaLabel }) {
  const [games, setGames] = useState(catalog)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [rect, setRect] = useState(null)
  const box = useRef(null)
  const list = useRef(null)

  useEffect(() => {
    if (!games) loadCatalog().then(setGames).catch(() => setGames([]))
  }, [games])

  const results = useMemo(() => {
    const k = q.trim().toLowerCase()
    if (!k || !games) return []
    const starts = []
    const has = []
    for (const g of games) {
      if (g.key.startsWith(k)) starts.push(g)
      else if (g.key.includes(k)) has.push(g)
      if (starts.length >= 12) break
    }
    return [...starts, ...has].slice(0, 12)
  }, [q, games])

  const showList = open && results.length > 0

  // keep a floating list pinned under the input while the page or bracket scrolls
  useLayoutEffect(() => {
    if (!floating || !showList) return undefined
    const place = () => {
      const r = box.current?.getBoundingClientRect()
      if (r) setRect({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 300), below: window.innerHeight - r.bottom })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [floating, showList])

  const pick = (g) => {
    onPick(g ?? { name: q.trim(), slug: null, provider: null, image: null })
    setQ('')
    setOpen(false)
  }

  const inside = (el) => Boolean(el && (box.current?.contains(el) || list.current?.contains(el)))

  const items = (
    <ul
      className={`adm-slot-list${floating ? ' is-floating' : ''}`}
      role="listbox"
      ref={list}
      style={
        floating && rect
          ? {
              left: Math.min(rect.left, window.innerWidth - rect.width - 8),
              width: rect.width,
              // flip above the input when there's no room below
              ...(rect.below < 260 ? { top: 'auto', bottom: window.innerHeight - rect.top + 8 + (box.current?.offsetHeight ?? 0) } : { top: rect.top }),
            }
          : undefined
      }
    >
      {results.map((g, i) => (
        <li key={g.slug}>
          <button type="button" className={`adm-slot-item${i === active ? ' is-active' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(g)}>
            {g.image ? <img src={g.image} width="30" height="40" alt="" loading="lazy" /> : <span className="adm-slot-noart" />}
            <span className="adm-slot-name">{g.name}</span>
            <span className="adm-slot-prov">{g.provider}</span>
          </button>
        </li>
      ))}
    </ul>
  )

  return (
    <div
      className={`adm-slot${compact ? ' is-compact' : ''}`}
      ref={box}
      onBlur={(e) => {
        if (inside(e.relatedTarget)) return
        setOpen(false)
        onCancel?.()
      }}
    >
      <span className="adm-input">
        <input
          value={q}
          placeholder={games ? placeholder : 'Loading slots…'}
          autoFocus={autoFocus}
          aria-label={ariaLabel}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => (setQ(e.target.value), setOpen(true), setActive(0))}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => Math.min(a + 1, results.length - 1)))
            else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)))
            else if (e.key === 'Enter' && q.trim()) (e.preventDefault(), pick(results[active]))
            else if (e.key === 'Escape') (setOpen(false), onCancel?.())
          }}
        />
      </span>
      {showList && (floating ? rect && createPortal(items, document.body) : items)}
    </div>
  )
}
