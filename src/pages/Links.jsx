import { Link } from 'react-router-dom'
import { config } from '../data/leaderboard'
import {
  IconTrophy, IconGift, IconBolt, IconChevron, IconExternal,
  IconDiscord, IconKick, IconInstagram, IconYoutube, IconX,
} from '../components/icons'

// Card icons are named in the data file so links can be reordered or added
// there without touching this component.
const LINK_ICONS = {
  rainbet: <IconGift />,
  trophy: <IconTrophy />,
  bolt: <IconBolt />,
  discord: <IconDiscord />,
  kick: <IconKick />,
  instagram: <IconInstagram />,
  youtube: <IconYoutube />,
  x: <IconX />,
}

function LinkCard({ card }) {
  const cls = `link-card ${card.accent === 'gold' ? 'gold' : ''}`
  const inner = (
    <>
      <span className="link-card-ico">
        {card.img
          ? <img src={card.img} alt="" loading="lazy" />
          : LINK_ICONS[card.icon] || <IconExternal />}
      </span>
      <span className="link-card-text">
        <span className="link-card-title">{card.title}</span>
        <span className="link-card-sub">{card.subtitle}</span>
      </span>
      <span className="link-card-chev"><IconChevron /></span>
    </>
  )

  // Internal routes stay in the SPA; everything else opens in a new tab.
  if (card.to) return <Link className={cls} to={card.to}>{inner}</Link>
  return <a className={cls} href={card.href} target="_blank" rel="noreferrer">{inner}</a>
}

export default function Links() {
  const { avatar, handle, tagline, cards } = config.linksPage

  return (
    <section className="section" id="links">
      <div className="links-wrap">
        <div className="links-head">
          <img className="links-avatar" src={avatar} alt="TEGENS" />
          <h1 className="links-brand display">{config.brandName}</h1>
          <p className="links-handle">{handle}</p>
          <p className="links-tagline">{tagline}</p>
          <div className="links-code">
            <span className="label">CODE</span>
            <span className="code">{config.referralCode}</span>
          </div>
        </div>

        <div className="links-list">
          {cards.map((c) => <LinkCard key={c.title} card={c} />)}
        </div>

        <p className="links-note">18+ · Play responsibly</p>
      </div>
    </section>
  )
}
