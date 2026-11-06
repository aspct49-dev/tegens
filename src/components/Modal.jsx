import { useEffect, useRef, useState } from 'react'

// Shared dialog shell: fades in/out, closes on Escape or a click outside,
// locks page scroll, and moves focus to the close button once shown.
export default function Modal({ open, onClose, labelledBy, className = '', children }) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  const closeRef = useRef()
  const downOnScrim = useRef(false)
  const opener = useRef(null)

  useEffect(() => {
    if (open) {
      opener.current = document.activeElement
      setMounted(true)
      let r2
      const r1 = requestAnimationFrame(() => (r2 = requestAnimationFrame(() => setShown(true))))
      return () => {
        cancelAnimationFrame(r1)
        cancelAnimationFrame(r2)
      }
    }
    setShown(false)
    // Hand focus back to whatever opened the dialog, if it is still there.
    if (opener.current?.isConnected) opener.current.focus({ preventScroll: true })
    opener.current = null
    const t = setTimeout(() => setMounted(false), 220)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.documentElement.classList.add('no-scroll')
    return () => {
      window.removeEventListener('keydown', onKey)
      document.documentElement.classList.remove('no-scroll')
    }
  }, [open, onClose])

  useEffect(() => {
    if (shown) closeRef.current?.focus({ preventScroll: true })
  }, [shown])

  if (!mounted) return null

  return (
    // Close only on a click that starts and ends on the backdrop, so a text
    // selection dragged out of the dialog does not dismiss it.
    <div
      className={`modal-scrim${shown ? ' is-open' : ''}`}
      onMouseDown={(e) => (downOnScrim.current = e.target === e.currentTarget)}
      onClick={(e) => {
        if (downOnScrim.current && e.target === e.currentTarget) onClose()
        downOnScrim.current = false
      }}
    >
      <div
        className={`modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        <button className="modal-close" ref={closeRef} onClick={onClose} aria-label="Close">×</button>
        {children}
      </div>
    </div>
  )
}
