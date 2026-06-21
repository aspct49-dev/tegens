import { Link } from 'react-router-dom'
import { config } from '../data/leaderboard'
import { IconDiscord, IconKick, IconInstagram } from './icons'

export default function Footer() {
  const s = config.socials
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <div className="f-brand">
              <img src="/TGN.webp" alt="TEGENS" />
              <span>TEGENS</span>
            </div>
            <p className="f-desc">
              The official {config.casino} leaderboard for code <strong>{config.referralCode}</strong>.
              Wager, climb the ranks, and win your share of the prize pool.
            </p>
          </div>

          <div className="f-col">
            <h4>Navigate</h4>
            <Link to="/">Home</Link>
            <Link to="/leaderboard">Leaderboard</Link>
            <Link to="/#bonuses">Bonuses</Link>
            <a href={config.casinoUrl} target="_blank" rel="noreferrer">Play on {config.casino}</a>
          </div>

          <div className="f-col">
            <h4>Community</h4>
            <a href={s.discord} target="_blank" rel="noreferrer">Discord</a>
            <a href={s.instagram} target="_blank" rel="noreferrer">Instagram</a>
            <a href={s.kick} target="_blank" rel="noreferrer">Kick</a>
          </div>

          <div className="f-col">
            <h4>Legal</h4>
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms &amp; Conditions</Link>
            <Link to="/responsible-gambling">Responsible Gambling</Link>
          </div>
        </div>

        {/* Responsible gambling / 18+ bar */}
        <div className="rg-bar">
          <span className="rg-18">18+</span>
          <p>
            Gamble responsibly. Gambling can be addictive — please play within your limits and never
            wager more than you can afford to lose. If you or someone you know has a gambling problem,
            visit{' '}
            <a href="https://www.begambleaware.org/" target="_blank" rel="noreferrer">BeGambleAware.org</a>{' '}
            or call the National Gambling Helpline. You must be 18+ (or the legal age in your
            jurisdiction) to participate. See our{' '}
            <Link to="/responsible-gambling">Responsible Gambling</Link> page.
          </p>
        </div>

        <p className="disclaimer">
          {config.brandName} is an independent affiliate of {config.casino} and is not owned or
          operated by {config.casino}. We may earn a commission when you sign up or play using code{' '}
          {config.referralCode} or our links. Nothing here is a guarantee of winnings; gambling
          involves real financial risk. You must be of legal age in your jurisdiction to participate.
          Please play responsibly. 18+ only.
        </p>

        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} TEGENS. All rights reserved.</span>
          <div style={{ display: 'flex', gap: 16 }}>
            <a href={s.discord} target="_blank" rel="noreferrer" aria-label="Discord"><IconDiscord /></a>
            <a href={s.instagram} target="_blank" rel="noreferrer" aria-label="Instagram"><IconInstagram /></a>
            <a href={s.kick} target="_blank" rel="noreferrer" aria-label="Kick"><IconKick /></a>
          </div>
        </div>
      </div>
    </footer>
  )
}
