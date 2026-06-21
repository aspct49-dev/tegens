import { config } from '../data/leaderboard'
import LegalPage from '../components/LegalPage'

export default function ResponsibleGambling() {
  return (
    <LegalPage title="Responsible Gambling" updated="June 21, 2026">
      <p>
        {config.brandName} is committed to promoting responsible gambling. Gambling should be a form
        of entertainment — never a way to make money or escape problems. You must be{' '}
        <strong>18+</strong> (or the legal age in your jurisdiction) to participate.
      </p>

      <h2>Stay in control</h2>
      <ul>
        <li>Only gamble with money you can afford to lose.</li>
        <li>Set deposit, loss, and time limits before you play — and stick to them.</li>
        <li>Never chase your losses.</li>
        <li>Don’t gamble when stressed, upset, or under the influence.</li>
        <li>Treat gambling as paid entertainment, not income.</li>
        <li>Take regular breaks.</li>
      </ul>

      <h2>Warning signs</h2>
      <p>Gambling may be becoming a problem if you:</p>
      <ul>
        <li>Spend more time or money than you intended.</li>
        <li>Gamble to recover losses or to win back money.</li>
        <li>Borrow money or sell things to gamble.</li>
        <li>Lie about or hide your gambling.</li>
        <li>Feel anxious, guilty, or irritable about gambling.</li>
        <li>Neglect work, studies, family, or friends because of gambling.</li>
      </ul>

      <h2>Tools that can help</h2>
      <p>
        {config.casino} offers responsible-gambling tools such as deposit limits, cool-off periods,
        and self-exclusion. You can enable these directly in your {config.casino} account settings,
        or contact their support for help.
      </p>

      <h2>Where to get help</h2>
      <p>If you or someone you know needs support, free and confidential help is available:</p>
      <ul>
        <li><strong>BeGambleAware</strong> — advice and support: <a href="https://www.begambleaware.org/" target="_blank" rel="noreferrer">begambleaware.org</a> (National Gambling Helpline: 0808 8020 133, UK).</li>
        <li><strong>GamCare</strong> — <a href="https://www.gamcare.org.uk/" target="_blank" rel="noreferrer">gamcare.org.uk</a>.</li>
        <li><strong>Gamblers Anonymous</strong> — <a href="https://www.gamblersanonymous.org/" target="_blank" rel="noreferrer">gamblersanonymous.org</a>.</li>
        <li><strong>United States</strong> — National Problem Gambling Helpline: call or text <strong>1-800-522-4700</strong>, or visit <a href="https://www.ncpgambling.org/" target="_blank" rel="noreferrer">ncpgambling.org</a>.</li>
      </ul>

      <h2>Self-exclusion</h2>
      <p>
        If you need to stop, use the self-exclusion tools offered by {config.casino} and the
        organisations above. You can also block gambling sites using software such as Gamban or
        GAMSTOP (where available).
      </p>

      <h2>Protecting minors</h2>
      <p>
        Gambling is strictly for adults. If a minor has access to your devices, please use parental
        control software to prevent underage access.
      </p>

      <p>
        Questions? Reach us on{' '}
        <a href={config.socials.discord} target="_blank" rel="noreferrer">Discord</a> or at{' '}
        <a href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a>.
      </p>
    </LegalPage>
  )
}
