import { useEffect, useRef, useState } from 'react'

// Saves `value` with `save(value)` 700 ms after the last change (and on leaving
// the page). Returns 'saved' | 'pending' | 'saving' | 'error' for a small status
// label. Changes made while a save runs are saved right after it.
//
//   const status = useAutosave(hunt, (h) => apiPost(`/api/admin/hunts/${h.id}`, h))

export function useAutosave(value, save, delay = 700) {
  const [status, setStatus] = useState('saved')
  const first = useRef(true)
  const latest = useRef(value)
  const saveRef = useRef(save)
  saveRef.current = save
  const timer = useRef(null)
  const running = useRef(false)
  const again = useRef(false)

  const flush = async () => {
    clearTimeout(timer.current)
    timer.current = null
    if (running.current) {
      again.current = true
      return
    }
    running.current = true
    setStatus('saving')
    try {
      await saveRef.current(latest.current)
      setStatus('saved')
    } catch {
      setStatus('error')
    } finally {
      running.current = false
      if (again.current) {
        again.current = false
        flush()
      }
    }
  }

  useEffect(() => {
    latest.current = value
    if (first.current) {
      first.current = false
      return undefined
    }
    setStatus('pending')
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, delay)
    return undefined
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      if (timer.current) flush()
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  )

  return status
}

export function SaveStatus({ status }) {
  const label = { saved: 'Saved', pending: 'Unsaved changes', saving: 'Saving…', error: 'Not saved: retrying on next change' }[status]
  return <span className={`adm-save is-${status}`}>{label}</span>
}
