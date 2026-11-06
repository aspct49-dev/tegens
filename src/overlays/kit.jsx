// The TGN overlay kit: every overlay is built from these so they read as one set.
// Look: simple dark panels in the site's colours, TGN blue for live things, gold
// for winners, tabular numbers (overlay.css).

/** The outer panel. `width` in px (scaled by ?scale) */
export function Plate({ width, children, className = '' }) {
  return (
    <div className={`ov-plate ${className}`} style={width ? { width } : undefined}>
      {children}
    </div>
  )
}

/** The plate's header: TGN mark, a title and something on the right (a pill, a number) */
export function PlateHead({ title, kicker, right }) {
  return (
    <header className="ov-head">
      <img className="ov-mark" src="/assets/tgn-logo.png" alt="" />
      <div className="ov-head-text">
        {kicker && <span className="ov-kicker">{kicker}</span>}
        <span className="ov-title">{title}</span>
      </div>
      {right && <div className="ov-head-right">{right}</div>}
    </header>
  )
}

/** A live / status pill: tone 'live' (blue, pulsing dot) | 'gold' | 'steel' */
export function Pill({ tone = 'steel', children }) {
  return (
    <span className={`ov-pill is-${tone}`}>
      {tone === 'live' && <span className="ov-dot" />}
      {children}
    </span>
  )
}

/** A figure tile: small label over a big number */
export function Figure({ label, value, tone }) {
  return (
    <div className={`ov-fig${tone ? ` is-${tone}` : ''}`}>
      <span className="ov-fig-label">{label}</span>
      <span className="ov-fig-value">{value}</span>
    </div>
  )
}

/** A recessed strip (like the raffle machine's display window) for lists and hero values */
export function Well({ children, className = '' }) {
  return <div className={`ov-well ${className}`}>{children}</div>
}

/** The plate's footer line */
export function Foot({ children }) {
  return <footer className="ov-foot">{children}</footer>
}

/** Slot art (portrait) with a fallback block */
export function SlotArt({ src, size = 40 }) {
  return src ? (
    <img className="ov-art" src={src} width={size * 0.75} height={size} alt="" />
  ) : (
    <span className="ov-art is-empty" style={{ width: size * 0.75, height: size }} />
  )
}

export const money = (n, currency = 'USD', digits = 2) =>
  n == null || !Number.isFinite(n)
    ? '—'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)

export const times = (n, digits = 2) => (n == null || !Number.isFinite(n) ? '—' : `${n.toFixed(digits)}×`)
