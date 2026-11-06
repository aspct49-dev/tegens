import { Link } from '../router'
import { setConsent, useConsent } from '../analytics'

// Asks before any analytics loads (src/analytics.js). Only appears when the server has a
// GA_MEASUREMENT_ID set; the site's own sign-in cookies don't need consent and aren't affected.
export default function ConsentBanner() {
  const { showBanner } = useConsent()
  if (!showBanner) return null
  return (
    <section className="consent" role="region" aria-label="Cookie choice">
      <p>
        Can we use Google Analytics to count visits and see which pages people use? It sets analytics cookies. Sign-in works either way.{' '}
        <Link to="/privacy">Privacy policy</Link>
      </p>
      <div className="consent-actions">
        <button type="button" className="consent-no" onClick={() => setConsent('denied')}>
          No thanks
        </button>
        <button type="button" className="btn-blue consent-yes" onClick={() => setConsent('granted')}>
          Allow analytics
        </button>
      </div>
    </section>
  )
}
