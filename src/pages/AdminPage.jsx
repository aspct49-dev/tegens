import { Suspense, useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import '../admin.css'
import { lazyPage } from '../lazyPage'
import PageError from '../components/PageError'
import { useAdminWaiting } from '../hooks/useAdminWaiting'

// /admin: the stream tools (bonus hunt, guess the balance, tournaments, giveaway,
// raffles, challenges, players, overlays). Only accounts whose Discord id is in
// ADMIN_DISCORD_IDS get in; the server checks every /api/admin call too.

// each section is its own file in src/admin/sections, loaded when opened
const SECTIONS = [
  { id: 'overview', label: 'Overview', group: 'Site', Page: lazyPage(() => import('../admin/sections/Overview')) },
  { id: 'players', label: 'Players', group: 'Site', Page: lazyPage(() => import('../admin/sections/Players')) },
  { id: 'points', label: 'Botrix Points', group: 'Site', Page: lazyPage(() => import('../admin/sections/Points')) },
  { id: 'links', mod: true, label: 'Links', group: 'Site', Page: lazyPage(() => import('../admin/sections/Links')) },
  { id: 'claims', mod: true, label: 'Claims', group: 'Site', Page: lazyPage(() => import('../admin/sections/Claims')) },
  { id: 'big-wins', label: 'Biggest Wins', group: 'Site', Page: lazyPage(() => import('../admin/sections/BigWins')) },
  { id: 'wagers', label: 'Wager Stats', group: 'Site', Page: lazyPage(() => import('../admin/sections/WagerStats')) },
  { id: 'milestone-claims', mod: true, label: 'Milestone Claims', group: 'Site', Page: lazyPage(() => import('../admin/sections/MilestoneClaims')) },
  {
    id: 'wager-store',
    label: 'Wager Store',
    group: 'Site',
    Page: lazyPage(() => import('../admin/sections/Shop').then((m) => ({ default: (props) => <m.default {...props} store="wager" /> }))),
  },
  {
    id: 'shop',
    label: 'Watch Store',
    group: 'Site',
    Page: lazyPage(() => import('../admin/sections/Shop').then((m) => ({ default: (props) => <m.default {...props} store="watch" /> }))),
  },
  { id: 'challenges', label: 'Challenges', group: 'Site', Page: lazyPage(() => import('../admin/sections/Challenges')) },
  { id: 'activity', label: 'Activity', group: 'Site', Page: lazyPage(() => import('../admin/sections/Activity')) },
  { id: 'mods', label: 'Moderators', group: 'Site', Page: lazyPage(() => import('../admin/sections/Mods')) },
  { id: 'hunt', mod: true, label: 'Bonus Hunt', group: 'Stream', Page: lazyPage(() => import('../admin/sections/Hunt')) },
  { id: 'guess', mod: true, label: 'Guess the Balance', group: 'Stream', Page: lazyPage(() => import('../admin/sections/Guess')) },
  { id: 'tournaments', mod: true, label: 'Tournaments', group: 'Stream', Page: lazyPage(() => import('../admin/sections/Tournaments')) },
  { id: 'giveaway', mod: true, label: 'Chat Giveaway', group: 'Stream', Page: lazyPage(() => import('../admin/sections/Giveaway')) },
  { id: 'giveaway-wins', mod: true, label: 'Giveaway Wins', group: 'Stream', Page: lazyPage(() => import('../admin/sections/GiveawayWins')) },
  { id: 'slots', mod: true, label: 'Slot Picker', group: 'Stream', Page: lazyPage(() => import('../admin/sections/SlotPick')) },
  { id: 'raffles', mod: true, label: 'Raffles', group: 'Stream', Page: lazyPage(() => import('../admin/sections/Raffles')) },
  { id: 'overlays', mod: true, label: 'Overlays', group: 'Stream', Page: lazyPage(() => import('../admin/sections/Overlays')) },
  { id: 'vips', label: 'VIPs', group: 'VIP', Page: lazyPage(() => import('../admin/sections/Vips')) },
  { id: 'calls', mod: true, label: 'Slot Calls', group: 'VIP', Page: lazyPage(() => import('../admin/sections/SlotCalls')) },
]

export default function AdminPage() {
  const { status, user, admin, mod, error, signInWithKick, signInWithDiscord } = useAuth()

  useEffect(() => {
    document.title = 'TEGENS — Admin'
  }, [])

  if (status === 'loading') return <div className="adm-gate"><span className="adm-spin" aria-label="Loading" /></div>

  if (!user || !(admin || mod)) {
    return (
      <div className="adm-gate">
        <div className="adm-gate-card">
          <h1 className="adm-gate-title">Admin</h1>
          {error && <p className="adm-gate-error">{error}</p>}
          {!user && (
            <>
              <p className="adm-gate-text">Sign in with the Kick account that's on the admin list.</p>
              <button className="adm-btn is-kick" onClick={() => signInWithKick('/admin')}>
                <img src="/assets/icon-kick.svg" width="16" height="16" alt="" /> Sign in with Kick
              </button>
            </>
          )}
          {user && !admin && (
            <>
              <p className="adm-gate-text">
                <b>{user.kick?.username ?? user.discord?.name}</b> isn't an admin or a mod. A mod is added by an admin under Moderators. An admin is added by putting the Kick username in{' '}
                <code>ADMIN_KICK_USERNAMES</code> (or the Discord ID to <code>ADMIN_DISCORD_IDS</code>) in the server's{' '}
                <code>.env</code>, restart the server, then reload this page.
              </p>
              {user.discord ? (
                <CopyId id={user.discord.id} />
              ) : (
                <button className="adm-btn is-discord" onClick={() => signInWithDiscord('/admin')}>
                  Or link Discord
                </button>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  return <AdminShell mod={!admin} />
}

function CopyId({ id }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="adm-id"
      onClick={() => navigator.clipboard?.writeText(id).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500)))}
    >
      <code>{id}</code>
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  )
}

const WAIT_NOUN = { claims: 'claim', 'big-wins': 'win', links: 'link request', 'wager-store': 'order', shop: 'order' }

function AdminShell({ mod = false }) {
  const sections = mod ? SECTIONS.filter((s) => s.mod) : SECTIONS
  // the same counts as the bell in the site's top bar (src/hooks/useAdminWaiting.js)
  const { waiting } = useAdminWaiting(mod ? 'mod' : 'admin')
  const totalWaiting = Object.values(waiting).reduce((a, b) => a + b, 0)
  useEffect(() => {
    document.title = totalWaiting > 0 ? `(${totalWaiting}) TEGENS — Admin` : 'TEGENS — Admin'
  }, [totalWaiting])

  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get('tab') || (mod ? 'claims' : 'overview'))
  // open('points', { kick: 'name' }): extra params go in the URL for the section to read
  const open = (id, params = {}) => {
    const url = new URL(window.location.href)
    url.search = ''
    url.searchParams.set('tab', id)
    for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v)
    window.history.replaceState(null, '', url.pathname + url.search)
    setTab(id)
  }
  const current = sections.find((s) => s.id === tab) ?? sections[0]
  const groups = [...new Set(sections.map((s) => s.group))]

  return (
    <div className="adm">
      <nav className="adm-nav" aria-label="Admin sections">
        {groups.map((g) => (
          <div className="adm-nav-group" key={g}>
            <span className="adm-nav-label">{g}</span>
            {sections.filter((s) => s.group === g).map((s) => {
              const count = waiting[s.id] ?? 0
              return (
                <button
                  key={s.id}
                  className={`adm-nav-item${s.id === current.id ? ' is-active' : ''}`}
                  onClick={() => open(s.id)}
                  aria-label={count > 0 ? `${s.label}, ${count} ${WAIT_NOUN[s.id]}${count === 1 ? '' : 's'} waiting` : undefined}
                >
                  {s.label}
                  {count > 0 && (
                    <span className="adm-nav-badge" aria-hidden="true">
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </nav>
      <section className="adm-main" aria-labelledby="adm-title">
        <h1 id="adm-title" className="adm-title">{current.label}</h1>
        <PageError key={current.id} className="adm-page-error">
          <Suspense fallback={<span className="adm-spin adm-spin-inline" aria-label="Loading" />}>
            <current.Page key={current.id} open={open} />
          </Suspense>
        </PageError>
      </section>
    </div>
  )
}
