export default function Toast({ visible, children }) {
  return (
    <div className={`toast${visible ? ' is-visible' : ''}`} role="status" aria-live="polite">
      {children}
    </div>
  )
}
