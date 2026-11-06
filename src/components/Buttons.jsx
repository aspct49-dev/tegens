import { useRef, useState } from 'react'
import { config } from '../config'
import { copyText } from '../hooks/useToast'
import { useUI } from '../ui'

// "Code: Tegens" chip: copies the referral code and confirms with a toast.
export function CodeButton({ className = '' }) {
  const { toast } = useUI()
  const [copied, setCopied] = useState(false)
  const timer = useRef()
  const code = config.referralCode

  const copy = () =>
    copyText(code).then(
      () => {
        clearTimeout(timer.current)
        setCopied(true)
        timer.current = setTimeout(() => setCopied(false), 1200)
        toast(
          <>
            Code <span className="accent">{code}</span> copied to clipboard
          </>,
        )
      },
      () => toast(`Could not copy, the code is ${code}`),
    )

  return (
    <button className={`code-btn${copied ? ' is-copied' : ''} ${className}`} onClick={copy} aria-label={`Copy code ${code}`}>
      <span>
        <span className="muted">Code:</span> <span className="accent">{code}</span>
      </span>
      <img src="/assets/icon-copy.svg" width="17.9059" height="18" alt="" />
    </button>
  )
}

// "Visit [Rainbet]": the wordmark is the design's masked logo, tinted dark.
export function VisitButton({ className = '' }) {
  return (
    <a className={`visit-btn ${className}`} href={config.casinoUrl} target="_blank" rel="noopener noreferrer">
      <span>Visit</span>
      <span className="rainbet-logo" role="img" aria-label={config.casino} />
    </a>
  )
}

// "Rules": the chip beside Code / Visit that opens a page's how-it-works popup (StepsModal).
export function RulesButton({ onClick, label = 'Rules', className = '' }) {
  return (
    <button className={`page-rules-btn ${className}`} onClick={onClick}>
      <img src="/assets/icon-rules.svg" width="12.5" height="16.5" alt="" />
      {label}
    </button>
  )
}

// Solid blue action that opens the Discord server (e.g. "Discuss a Referral").
export function DiscordButton({ children, className = '' }) {
  return (
    <a className={`blue-btn ${className}`} href={config.discordUrl} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}

// "Watch on Kick": the stream pages' action beside the code chip (same height and surface).
export function WatchButton({ className = '' }) {
  return (
    <a className={`chip-btn watch-btn ${className}`} href={config.kickUrl} target="_blank" rel="noopener noreferrer">
      <img src="/assets/icon-kick.svg" width="15" height="15" alt="" />
      Watch on Kick
    </a>
  )
}
