import { Link } from 'react-router-dom'

// Shared layout for the Privacy / Terms / Responsible Gambling pages.
export default function LegalPage({ title, updated, children }) {
  return (
    <section className="section legal">
      <div className="container">
        <div className="legal-card">
          <Link to="/" className="legal-back">← Back to home</Link>
          <h1 className="legal-title">{title}</h1>
          {updated && <p className="legal-updated">Last updated: {updated}</p>}
          <div className="legal-body">{children}</div>
        </div>
      </div>
    </section>
  )
}
