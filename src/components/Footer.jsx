import { config } from '../config'
import { Link } from '../router'
import { reopenConsent, useConsent } from '../analytics'
import './Footer.css'

// The site footer (laid out like King Kulbik's): the TGN mark, the 18+ and
// BeGambleAware marks, the disclaimer and socials, then link columns, then the
// legal line. Sits at the bottom of every page in the App shell.

const KickIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M1.333 0h8v5.333H12V2.667h2.667V0h8v8H20v2.667h-2.667v2.666H20V16h2.667v8h-8v-2.667H12v-2.666H9.333V24h-8Z" />
  </svg>
)

const DiscordIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M20.3 4.4A19.6 19.6 0 0 0 15.4 3l-.6 1.3a18 18 0 0 0-5.6 0L8.6 3a19.5 19.5 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18a19.8 19.8 0 0 0 6 3l1.3-2a12.7 12.7 0 0 1-2-1l.5-.4a14 14 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2a19.7 19.7 0 0 0 6-3c.5-5.1-.8-9.6-3.6-13.6ZM8 15.3c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z"
    />
  </svg>
)

const YouTubeIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.2 3.6-6.2 3.6Z" />
  </svg>
)

const XIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M18.2 2.3h3.4l-7.4 8.4 8.7 11.5h-6.8l-5.3-7-6.1 7H1.3l7.9-9L.9 2.3h7l4.8 6.4 5.5-6.4Zm-1.2 17.9h1.9L7 4.2H5Z" />
  </svg>
)

const InstagramIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M12 2.2c3.2 0 3.6 0 4.8.1 3.3.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 3.2-1.7 4.8-4.9 4.9-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-3.3-.1-4.8-1.7-4.9-4.9C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.8C2.4 3.9 3.9 2.4 7.2 2.3c1.2-.1 1.6-.1 4.8-.1ZM12 0C8.7 0 8.3 0 7.1.1 2.7.3.3 2.7.1 7.1 0 8.3 0 8.7 0 12s0 3.7.1 4.9c.2 4.4 2.6 6.8 7 7 1.2.1 1.6.1 4.9.1s3.7 0 4.9-.1c4.4-.2 6.8-2.6 7-7 .1-1.2.1-1.6.1-4.9s0-3.7-.1-4.9c-.2-4.4-2.6-6.8-7-7C15.7 0 15.3 0 12 0Zm0 5.8a6.2 6.2 0 1 0 0 12.4 6.2 6.2 0 0 0 0-12.4ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.4-11.8a1.4 1.4 0 1 0 0 2.9 1.4 1.4 0 0 0 0-2.9Z" />
  </svg>
)

const SOCIALS = [
  { label: 'Kick', url: config.kickUrl, brand: '#53fc18', icon: <KickIcon /> },
  { label: 'Discord', url: config.discordUrl, brand: '#5865f2', icon: <DiscordIcon /> },
  { label: 'YouTube', url: `https://www.youtube.com/@${config.socials.youtube.handle}`, brand: '#ff2f32', icon: <YouTubeIcon /> },
  { label: 'Twitter', url: `https://x.com/${config.socials.twitter}`, brand: '#f4f4f4', icon: <XIcon /> },
  { label: 'Instagram', url: `https://www.instagram.com/${config.socials.instagram}/`, brand: '#e33e89', icon: <InstagramIcon /> },
]

const EXPLORE = [
  { to: '/', label: 'Home' },
  { to: '/leaderboard', label: 'Monthly Leaderboard' },
  { to: '/biggest-wins', label: 'Biggest Wins' },
  { to: '/milestones', label: 'Milestones' },
  { to: '/bonuses', label: 'Bonuses' },
  { to: '/raffles', label: 'Raffles' },
  { to: '/store', label: 'Item Store' },
  { to: '/refer', label: 'Refer to Earn' },
  { to: '/how-to-sign-up', label: 'How to sign up' },
  { to: '/socials', label: 'Socials & Media' },
  { to: '/contact', label: 'Contact' },
]

const STREAM = [
  { to: '/giveaways', label: 'Giveaways' },
  { to: '/bonus-hunt', label: 'Bonus Hunt' },
  { to: '/guess-the-balance', label: 'Guess the Balance' },
  { to: '/tournaments', label: 'Tournaments' },
  { to: '/challenges', label: 'Challenges' },
  { to: '/slot-picker', label: 'Slot Picker' },
  { to: '/vips', label: 'VIP Calls' },
]

export default function Footer() {
  const code = config.referralCode.toUpperCase()
  const analytics = useConsent()
  return (
    <footer className="footer">
      <div className="footer-card">
        <div className="footer-top">
          <div className="footer-brand">
            <Link to="/" className="footer-logo" aria-label="TEGENS home">
              <img src="/assets/tgn-logo.png" width="74" height="44" alt="" loading="lazy" />
            </Link>

            <div className="footer-marks">
              <a href="https://www.begambleaware.org" target="_blank" rel="noopener noreferrer">
                <img className="footer-aware" src="/assets/footer/gambleaware.png" alt="BeGambleAware" width="163" height="24" loading="lazy" />
              </a>
              <span className="footer-age" title="You must be 18 or older">18+</span>
            </div>

            <p className="footer-note">
              We take no responsibility for losses at any casino linked or promoted here. You are responsible for your own bets. TEGENS is a
              community rewards site for Rainbet players under the code <strong>{code}</strong>. It is not a casino, and it is not operated by
              Rainbet.
            </p>

            <div className="footer-icons" aria-label="Social media">
              {SOCIALS.map((s) => (
                <a key={s.label} href={s.url} target="_blank" rel="noopener noreferrer" aria-label={s.label} style={{ '--brand': s.brand }}>
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          <nav className="footer-col" aria-label="Explore">
            <h2 className="footer-col-title">Explore</h2>
            {EXPLORE.map((l) => (
              <Link key={l.to} to={l.to}>
                {l.label}
              </Link>
            ))}
            <a href={config.casinoUrl} target="_blank" rel="noopener noreferrer">
              Visit Rainbet
            </a>
          </nav>

          <nav className="footer-col" aria-label="On stream">
            <h2 className="footer-col-title">On Stream</h2>
            {STREAM.map((l) => (
              <Link key={l.to} to={l.to}>
                {l.label}
              </Link>
            ))}
          </nav>

          <nav className="footer-col" aria-label="Social media links">
            <h2 className="footer-col-title">Social Media</h2>
            {SOCIALS.map((s) => (
              <a key={s.label} href={s.url} target="_blank" rel="noopener noreferrer" style={{ '--brand': s.brand }}>
                {s.icon}
                {s.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="footer-legal">
          <span className="footer-copyright">© {new Date().getUTCFullYear()} TEGENS - All Rights Reserved.</span>
          <nav className="footer-policies" aria-label="Policies">
            <Link to="/terms">Terms of Service</Link>
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/responsible-gambling">Responsible Gambling</Link>
            {analytics.enabled && (
              <button type="button" className="footer-cookies" onClick={reopenConsent}>
                Cookie settings
              </button>
            )}
          </nav>
          <span className="footer-responsible">18+ only · Gamble responsibly</span>
        </div>
      </div>
    </footer>
  )
}
