import { config } from '../config'
import { fmtMoney } from '../utils'
import Modal from './Modal'

const fmtDate = (d) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export default function RulesModal({ open, onClose, period }) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="rules-title">
      <h2 id="rules-title">Competition Rules</h2>
      <ul>
        <li>
          Sign up and play on {config.casino} under code <b>{config.referralCode}</b> — only wagers made under the code count.
        </li>
        <li>
          This leaderboard runs from <b>{fmtDate(period.startAt)}</b> to <b>{fmtDate(period.endAt)}</b> (UTC).
        </li>
        <li>
          Players are ranked by total <b>weighted</b> wager during the period. Wager counts by the game’s RTP:
          <table className="rules-weights">
            <thead>
              <tr>
                <th scope="col">Game RTP</th>
                <th scope="col">Wager counts</th>
              </tr>
            </thead>
            <tbody>
              {config.wagerWeights.map((w) => (
                <tr key={w.rtp}>
                  <td>{w.rtp}</td>
                  <td>{w.weight}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </li>
        <li>
          The top {config.prizes.length} players share a {fmtMoney(config.prizePool)} prize pool, paid out after the leaderboard ends.
        </li>
        <li>Standings update automatically and may lag {config.casino} by a few minutes.</li>
        <li>Any abuse, self-wagering or exploiting will result in disqualification.</li>
      </ul>
      <p className="modal-note">18+ only. Please gamble responsibly.</p>
    </Modal>
  )
}
