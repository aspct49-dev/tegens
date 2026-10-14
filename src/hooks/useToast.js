import { useCallback, useRef, useState } from 'react'

// Single bottom toast, auto-hides after 1.8s (same timing as rekoj).
export function useToast() {
  const [toast, setToast] = useState({ visible: false, content: null })
  const timer = useRef()

  const show = useCallback((content) => {
    clearTimeout(timer.current)
    setToast({ visible: true, content })
    timer.current = setTimeout(() => setToast((t) => ({ ...t, visible: false })), 1800)
  }, [])

  return [toast, show]
}

// navigator.clipboard needs a secure context (https/localhost); fall back to
// execCommand so copying still works over plain http (e.g. LAN previews).
export function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text)
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try {
      document.execCommand('copy') ? resolve() : reject()
    } catch (e) {
      reject(e)
    }
    document.body.removeChild(ta)
  })
}
