import { useEffect, useRef, useState } from 'react'

// The admin form kit, in the site's look (admin.css). Every section builds its
// forms from these so they all line up.

/** A labelled form control */
export function Field({ label, hint, children, wide }) {
  return (
    <label className={`adm-field${wide ? ' is-wide' : ''}`}>
      <span className="adm-field-label">{label}</span>
      {children}
      {hint && <span className="adm-field-hint">{hint}</span>}
    </label>
  )
}

/** Text / number input; `unit` shows on the left (e.g. "$") */
export function Input({ value, onChange, unit, ...rest }) {
  return (
    <span className={`adm-input${unit ? ' has-unit' : ''}`}>
      {unit && <span className="adm-input-unit">{unit}</span>}
      <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} autoComplete="off" spellCheck={false} {...rest} />
    </span>
  )
}

export function Select({ value, onChange, options }) {
  return (
    <span className="adm-input">
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  )
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className={`adm-toggle${checked ? ' is-on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="adm-toggle-track"><span className="adm-toggle-knob" /></span>
      {label && <span>{label}</span>}
    </button>
  )
}

/** A button: kind 'primary' (blue) | 'ghost' | 'danger' */
export function Button({ kind = 'ghost', busy, disabled, children, ...rest }) {
  return (
    <button type="button" className={`adm-b is-${kind}`} {...rest} disabled={busy || disabled}>
      {busy && <span className="adm-b-spin" aria-hidden="true" />}
      {children}
    </button>
  )
}

/** A destructive button that asks "Sure?" on the first click */
export function ConfirmButton({ onConfirm, children, confirmLabel = 'Click again to confirm', kind = 'danger', ...rest }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return undefined
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <Button kind={kind} {...rest} onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>
      {armed ? confirmLabel : children}
    </Button>
  )
}

/** A panel: title row (with actions on the right) and content */
export function Card({ title, actions, children, className = '' }) {
  return (
    <section className={`adm-card ${className}`}>
      {(title || actions) && (
        <header className="adm-card-head">
          {title && <h2 className="adm-card-title">{title}</h2>}
          {actions && <div className="adm-card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

/** One figure: label over value */
export function Stat({ label, value, tone }) {
  return (
    <div className={`adm-stat${tone ? ` is-${tone}` : ''}`}>
      <span className="adm-stat-label">{label}</span>
      <span className="adm-stat-value">{value}</span>
    </div>
  )
}

export function Empty({ children }) {
  return <p className="adm-empty">{children}</p>
}

/** A status pill: tone 'live' | 'ok' | 'warn' | 'off' */
export function Pill({ tone = 'off', children }) {
  return <span className={`adm-pill is-${tone}`}>{children}</span>
}

/** An error line under a form ("" or null shows nothing) */
export function ErrorLine({ children }) {
  return children ? <p className="adm-error" role="alert">{children}</p> : null
}

/** The section's top bar: what it is, plus page-level actions */
export function SectionIntro({ children, actions }) {
  return (
    <div className="adm-intro">
      <p>{children}</p>
      {actions && <div className="adm-intro-actions">{actions}</div>}
    </div>
  )
}

/** "12.5" → 12.5; anything that isn't a number → null */
export const num = (v) => {
  const n = Number(String(v ?? '').replace(/[,$\s]/g, ''))
  return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null
}

/** Remember a value across renders without re-running effects (for callbacks in timers) */
export function useLatest(value) {
  const r = useRef(value)
  r.current = value
  return r
}
