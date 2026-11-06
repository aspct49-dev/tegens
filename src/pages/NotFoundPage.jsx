import { Link } from '../router'
import PageHeading, { PageBackdrop } from '../components/PageHeading'

// Any address that isn't a page. The server answers these with HTTP 404 (server/seo.js);
// here the visitor gets the way back to the pages people usually look for.
const POPULAR = [
  { to: '/leaderboard', label: 'Monthly leaderboard' },
  { to: '/biggest-wins', label: 'Biggest wins' },
  { to: '/milestones', label: 'Wager milestones' },
  { to: '/raffles', label: 'Raffles' },
  { to: '/bonuses', label: 'Bonuses' },
  { to: '/contact', label: 'Contact us' },
]

export default function NotFoundPage() {
  return (
    <div className="titled-page">
      <PageBackdrop />
      <PageHeading top="PAGE NOT" bottom="FOUND" wordmark={false}>
        This page doesn’t exist, or it has moved.
      </PageHeading>
      <div className="page-actions enter" style={{ '--d': '160ms' }}>
        <Link to="/" className="btn-blue">
          Go to the home page
        </Link>
      </div>
      <nav className="nf-links enter" style={{ '--d': '240ms' }} aria-label="Popular pages">
        <p>Or try one of these:</p>
        <ul>
          {POPULAR.map((p) => (
            <li key={p.to}>
              <Link to={p.to}>{p.label}</Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
