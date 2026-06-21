import { config } from '../data/leaderboard'
import LegalPage from '../components/LegalPage'

export default function Terms() {
  return (
    <LegalPage title="Terms & Conditions" updated="June 21, 2026">
      <p>
        These Terms &amp; Conditions govern your use of the <strong>{config.brandName}</strong>{' '}
        website. By accessing or using this site, you agree to them. If you do not agree, please do
        not use the site.
      </p>

      <h2>1. Eligibility</h2>
      <p>
        You must be at least <strong>18 years old</strong> (or the legal gambling age in your
        jurisdiction, whichever is higher) and legally permitted to gamble where you live. Gambling
        is restricted or prohibited in some jurisdictions; it is your responsibility to ensure you
        comply with your local laws.
      </p>

      <h2>2. Affiliate disclosure</h2>
      <p>
        {config.brandName} is an <strong>independent affiliate</strong> of {config.casino}. We are not
        owned or operated by {config.casino}. When you sign up or play using our code{' '}
        <strong>{config.referralCode}</strong> or our links, we may earn a commission at no extra cost
        to you. This does not affect the odds, terms, or experience you receive from {config.casino}.
      </p>

      <h2>3. Leaderboard rules</h2>
      <ul>
        <li>To appear and rank on the leaderboard, you must be registered under code {config.referralCode} on {config.casino} and have affiliate tracking enabled.</li>
        <li>Wager totals are sourced from the {config.casino} affiliate API and are subject to its accuracy and timing. Standings may be delayed or cached.</li>
        <li>Prizes are awarded for the listed competition period and are subject to verification.</li>
        <li>We reserve the right to adjust, withhold, or void prizes and to amend, suspend, or cancel any competition — including in cases of suspected fraud, collusion, multi-accounting, bonus abuse, or breach of {config.casino}’s terms.</li>
        <li>Our decisions on leaderboard results and disputes are final.</li>
      </ul>

      <h2>4. Rewards &amp; cashback</h2>
      <p>
        Any rewards, rakeback, or cashback promotions described on this site (including any
        “{config.brandName} pays you back as you wager” offer) are provided at our discretion, may
        require manual verification, and may be changed or discontinued at any time. Eligible wagers
        and amounts are determined using {config.casino} affiliate data.
      </p>

      <h2>5. No guarantees; gambling risk</h2>
      <p>
        Nothing on this site is a guarantee of winnings. Gambling involves real financial risk and
        you may lose money. Only gamble with funds you can afford to lose. See our{' '}
        <a href="/responsible-gambling">Responsible Gambling</a> page.
      </p>

      <h2>6. Intellectual property</h2>
      <p>
        The {config.brandName} name, logo, and site content are owned by us or our licensors and may
        not be copied or reused without permission. Third-party names and logos (including
        {' '}{config.casino}) belong to their respective owners.
      </p>

      <h2>7. Third-party links</h2>
      <p>
        This site links to third-party websites, including {config.casino}. We are not responsible for
        the content, terms, or practices of those sites. Your use of them is at your own risk and
        governed by their terms.
      </p>

      <h2>8. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, {config.brandName} is not liable for any losses or
        damages arising from your use of this site, your gambling activity, reliance on any
        information shown here, or inaccuracies in third-party data. The site is provided “as is”
        without warranties of any kind.
      </p>

      <h2>9. Indemnity</h2>
      <p>
        You agree to indemnify and hold {config.brandName} harmless from any claims arising out of
        your use of the site or breach of these terms.
      </p>

      <h2>10. Governing law</h2>
      <p>
        These terms are governed by the laws of the operator’s jurisdiction. Any disputes will be
        subject to the courts of that jurisdiction.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may update these Terms at any time. Continued use of the site after changes are posted
        means you accept the revised Terms.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions? Reach us on{' '}
        <a href={config.socials.discord} target="_blank" rel="noreferrer">Discord</a> or at{' '}
        <a href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a>.
      </p>
    </LegalPage>
  )
}
