import { config } from '../data/leaderboard'
import LegalPage from '../components/LegalPage'

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="June 21, 2026">
      <p>
        This Privacy Policy explains how <strong>{config.brandName}</strong> (“we”, “us”, “our”)
        collects, uses, and protects information when you visit this website. {config.brandName} is
        an independent affiliate that promotes {config.casino} under the referral code{' '}
        <strong>{config.referralCode}</strong>. We are not {config.casino}, and we do not operate any
        gambling service. By using this site you agree to this policy.
      </p>

      <h2>1. Information we collect</h2>
      <p>We keep data collection to a minimum. We may process:</p>
      <ul>
        <li><strong>Information you give us</strong> — for example when you contact us via Discord or email to claim a reward or ask a question.</li>
        <li><strong>Usage &amp; device data</strong> — collected automatically by our hosting provider and any analytics, such as IP address, browser type, device, pages viewed, and timestamps.</li>
        <li><strong>Cookies and similar technologies</strong> — see “Cookies” below.</li>
      </ul>
      <p>
        We do <strong>not</strong> collect your {config.casino} login credentials, deposit/withdrawal
        details, or payment information. Anything related to your casino account is handled solely by
        {' '}{config.casino}.
      </p>

      <h2>2. Leaderboard data</h2>
      <p>
        Our leaderboard displays public affiliate statistics (usernames and wagered totals) provided
        by the {config.casino} affiliate API for players using code {config.referralCode}. Usernames
        are partially <strong>masked</strong> on this site to protect privacy. If you do not want to
        appear on the leaderboard, do not opt in to public affiliate tracking with {config.casino}.
      </p>

      <h2>3. How we use information</h2>
      <ul>
        <li>To operate, maintain, and improve the website and leaderboard.</li>
        <li>To verify and pay out rewards and respond to your enquiries.</li>
        <li>To detect, prevent, and address fraud, abuse, or technical issues.</li>
        <li>To comply with legal obligations.</li>
      </ul>

      <h2>4. Cookies &amp; analytics</h2>
      <p>
        We may use cookies and similar technologies for essential site functionality and basic,
        privacy-respecting analytics. You can control or disable cookies through your browser
        settings; some features may not work correctly if you do.
      </p>

      <h2>5. Third-party services</h2>
      <p>We rely on a small number of third parties to run this site, including:</p>
      <ul>
        <li><strong>{config.casino}</strong> — provides the affiliate statistics shown here and operates the gambling platform we link to.</li>
        <li><strong>Hosting / CDN provider</strong> — serves the website and may log standard request data.</li>
        <li><strong>Social platforms</strong> (Discord, Instagram, Kick) — if you choose to interact with us there, their own privacy policies apply.</li>
      </ul>

      <h2>6. Sharing of information</h2>
      <p>
        We do not sell your personal information. We only share data with the service providers above
        as needed to run the site, or where required by law.
      </p>

      <h2>7. Data retention</h2>
      <p>
        We keep information only for as long as necessary for the purposes described here or as
        required by law, then delete or anonymise it.
      </p>

      <h2>8. Your rights</h2>
      <p>
        Depending on where you live, you may have the right to access, correct, delete, or restrict
        the processing of your personal data, and to object to certain processing. To make a request,
        contact us using the details below.
      </p>

      <h2>9. Children</h2>
      <p>
        This site is intended only for adults who are of legal gambling age in their jurisdiction
        (at least 18). We do not knowingly collect data from anyone under that age. See our{' '}
        <a href="/responsible-gambling">Responsible Gambling</a> page.
      </p>

      <h2>10. Security</h2>
      <p>
        We take reasonable measures to protect information, but no method of transmission or storage
        is completely secure, and we cannot guarantee absolute security.
      </p>

      <h2>11. International transfers</h2>
      <p>
        Our providers may process data in countries other than yours. Where we transfer data
        internationally, we take steps to ensure it remains protected.
      </p>

      <h2>12. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. Changes take effect when posted on this
        page, and the “Last updated” date will be revised accordingly.
      </p>

      <h2>13. Contact us</h2>
      <p>
        Questions about this policy or your data? Reach us on{' '}
        <a href={config.socials.discord} target="_blank" rel="noreferrer">Discord</a> or by email at{' '}
        <a href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a>.
      </p>
    </LegalPage>
  )
}
