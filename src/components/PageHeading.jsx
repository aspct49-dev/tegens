import { config } from '../config'

// Rainbet wordmark, a two-line display title (blue over silver) and an
// optional subtitle. Shared by Milestones, Refer to Earn, How to Sign Up and
// Bonuses (which drops the wordmark).
export default function PageHeading({ top, bottom, children, decos = null, wordmark = true }) {
  return (
    <header className="page-heading">
      {decos}
      {wordmark && (
        <span className="rainbet-wordmark enter" role="img" aria-label={config.casino} style={{ '--d': '0ms' }} />
      )}
      <h1 className="page-title enter" style={{ '--d': '60ms' }}>
        <span className="page-title-top grad-blue">{top}</span>
        <span className="page-title-bottom grad-silver">{bottom}</span>
      </h1>
      {children && (
        <p className="page-sub enter" style={{ '--d': '120ms' }}>
          {children}
        </p>
      )}
    </header>
  )
}

// The faded crowd backdrop behind the titled pages (60% opacity in the design).
export function PageBackdrop() {
  return <img className="page-backdrop" src="/assets/td/page-bg.webp" width="1664" height="1106" alt="" />
}
