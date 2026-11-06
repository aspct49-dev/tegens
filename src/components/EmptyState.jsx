// "Nothing here yet" for every page: the raised box with an optional mark, a title, a line of
// explanation and optional actions. Styles in index.css (.empty-state).
//
//   <EmptyState title="No hunt running" icon>Hunts run live on stream…</EmptyState>
//   compact: tighter padding for an empty list inside a section
//   icon: true for the TGN mark, or a node of your own
//   titleAs: 'h2' when the title is the section's heading
export default function EmptyState({ title, children, icon = false, actions = null, compact = false, titleAs: Title = 'p', delay, className = '' }) {
  const mark = icon === true ? <img className="empty-state-icon" src="/assets/tgn-logo.png" width="52" height="35" alt="" /> : icon || null
  return (
    <div
      className={`empty-state${compact ? ' is-compact' : ''}${delay != null ? ' enter' : ''} ${className}`.trim()}
      style={delay != null ? { '--d': `${delay}ms` } : undefined}
    >
      {mark}
      {title && <Title className="empty-state-title">{title}</Title>}
      {children && <p className="empty-state-text">{children}</p>}
      {actions && <div className="empty-state-actions">{actions}</div>}
    </div>
  )
}
