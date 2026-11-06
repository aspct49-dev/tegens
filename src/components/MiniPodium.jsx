import { config } from '../config'
import { fmtMoney } from '../utils'

// The Step 3 card's tiny podium: the real podium card layout drawn at 281x349
// and scaled onto the design's 65.8x81.7 card art, so the type stays crisp.
const CARDS = [
  { rank: 2, place: 'second', box: 'mini-box2.png', avatar: 'mini-avatar2.png' },
  { rank: 1, place: 'first', box: 'mini-box1.png', avatar: 'mini-avatar1.png' },
  { rank: 3, place: 'third', box: 'mini-box3.png', avatar: 'mini-avatar3.png' },
]

export default function MiniPodium() {
  return (
    <div className="mini-podium" aria-hidden="true">
      {CARDS.map((c) => (
        <div className={`mini-card ${c.place}`} key={c.rank}>
          <img className="mini-box" src={`/assets/td/${c.box}`} width="66" height="82" alt="" />
          <div className="mini-scale">
            <div className="podium-content">
              <img className="podium-avatar" src={`/assets/td/${c.avatar}`} width="113" height="113" alt="" />
              <p className="podium-name">Tegens***</p>
              <div className="podium-wager">
                <span>$329,832</span>
              </div>
              <p className="podium-wager-lbl">WAGERED</p>
              <p className="podium-reward">{fmtMoney(config.prizes[c.rank - 1] || 0)}</p>
              <p className="podium-reward-lbl">REWARD</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
