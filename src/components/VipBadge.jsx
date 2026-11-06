import { useVips } from '../hooks/useVips'
import '../vip-badge.css'

// The VIP mark that pops up next to a VIP's name anywhere on the site (leaderboard,
// giveaway winners, raffles, the account chip). Renders nothing for everyone else.
//   name   the name as shown (before any masking)
//   via    'kick' | 'rainbet' | 'any': which list the name belongs to (see useVips)
//   size   'sm' (tables, 16px) | 'md' (cards, 20px)
//   icon   true: just the crown (tight spots, e.g. on an avatar)
//   force  true: show it without a lookup (the name is known to be a VIP)

export function Crown({ size = 10 }) {
  return (
    <svg className="vip-crown" width={size} height={Math.round(size * 0.8)} viewBox="0 0 20 16" aria-hidden="true">
      <path d="M1.5 4.2 6 8.3 10 1.5l4 6.8 4.5-4.1-1.7 9.3H3.2Z" fill="currentColor" />
      <rect x="3.2" y="13.8" width="13.6" height="2.2" rx="1" fill="currentColor" />
    </svg>
  )
}

export default function VipBadge({ name, via = 'any', size = 'sm', icon = false, force = false }) {
  const { isVip } = useVips()
  if (!force && !isVip(name, via)) return null
  if (icon)
    return (
      <span className="vip-badge is-icon" title="VIP" role="img" aria-label="VIP">
        <Crown size={9} />
      </span>
    )
  return (
    <span className={`vip-badge is-${size}`} title="VIP">
      <Crown size={size === 'md' ? 12 : 10} />
      <span className="vip-badge-text">VIP</span>
    </span>
  )
}
