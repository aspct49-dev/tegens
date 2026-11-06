import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost } from '../api'
import KickStatus from '../KickStatus'
import { Button, Card, ErrorLine, SectionIntro, Stat } from '../ui'
import './site.css'

// Overview: the site at a glance (GET /api/admin/overview) and a way into every section.

const n = (v) => (Number(v) || 0).toLocaleString('en-US')

/** One line per section, from the overview's tolerant summaries */
function lines(o) {
  const list = (s, noun) => {
    if (!s) return '—'
    if (s.live) return `${s.liveLabel ? `${s.liveLabel} · ` : ''}${s.live} live`
    return s.total ? `${n(s.total)} ${noun}${s.total === 1 ? '' : 's'}${s.latest ? ` · latest ${s.latest}` : ''}` : `No ${noun}s yet`
  }
  return {
    players: `${n(o.players.total)} accounts`,
    links: `${n(o.players.rainbet)} linked to Rainbet${o.players.rainbetPending ? ` · ${n(o.players.rainbetPending)} waiting` : ''}`,
    claims: o.claims?.total ? `${n(o.claims.total)} claims${o.claims.pending ? ` · ${n(o.claims.pending)} waiting` : ''}` : 'No claims yet',
    shop: o.shop?.total ? `${n(o.shop.total)} orders${o.shop.pending ? ` · ${n(o.shop.pending)} waiting` : ''}` : 'No orders yet',
    'wager-store': o.wagerStore?.total ? `${n(o.wagerStore.total)} orders${o.wagerStore.pending ? ` · ${n(o.wagerStore.pending)} waiting` : ''}` : 'No orders yet',
    challenges: o.challenges.total ? `${n(o.challenges.active)} active · ${n(o.challenges.completed)} won` : 'No challenges yet',
    hunt: list(o.hunts, 'hunt'),
    guess: list(o.guesses, 'round'),
    tournaments: list(o.tournaments, 'tournament'),
    giveaway: o.giveaway.status
      ? `${o.giveaway.status}${o.giveaway.keyword ? ` · !${String(o.giveaway.keyword).replace(/^!/, '')}` : ''} · ${n(o.giveaway.entries)} entries`
      : `${n(o.giveaway.wins)} past winners`,
    raffles: list(o.raffles, 'raffle'),
    overlays: 'OBS browser sources: links and previews',
  }
}

const LINKS = [
  { id: 'players', label: 'Players', group: 'Site' },
  { id: 'links', label: 'Links', group: 'Site' },
  { id: 'claims', label: 'Claims', group: 'Site' },
  { id: 'wager-store', label: 'Wager Store', group: 'Site' },
  { id: 'shop', label: 'Watch Store', group: 'Site' },
  { id: 'challenges', label: 'Challenges', group: 'Site' },
  { id: 'hunt', label: 'Bonus Hunt', group: 'Stream' },
  { id: 'guess', label: 'Guess the Balance', group: 'Stream' },
  { id: 'tournaments', label: 'Tournaments', group: 'Stream' },
  { id: 'giveaway', label: 'Chat Giveaway', group: 'Stream' },
  { id: 'raffles', label: 'Raffles', group: 'Stream' },
  { id: 'overlays', label: 'Overlays', group: 'Stream' },
]

const LIVE_IDS = { hunt: 'hunts', guess: 'guesses', tournaments: 'tournaments', raffles: 'raffles' }

export default function OverviewAdmin({ open }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    try {
      setData(await apiGet('/api/admin/overview'))
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [load])

  const summary = data ? lines(data) : null
  const isLive = (id) =>
    data && ((LIVE_IDS[id] && data[LIVE_IDS[id]]?.live > 0) || (id === 'giveaway' && /open|live|active|collecting/i.test(data.giveaway.status ?? '')))

  return (
    <>
      <SectionIntro actions={<Button onClick={load} busy={busy}>Refresh</Button>}>
        The site at a glance. Pick a section below, or from the menu, to run it.
      </SectionIntro>
      <ErrorLine>{error}</ErrorLine>

      <div className="ov-stats">
        <Stat label="Players" value={data ? n(data.players.total) : '…'} />
        <Stat label="Seen in 7 days" value={data ? n(data.players.seen7d) : '…'} tone="blue" />
        <Stat label="New in 7 days" value={data ? n(data.players.new7d) : '…'} />
        <Stat label="Rainbet linked" value={data ? n(data.players.rainbet) : '…'} />
        <Stat label="Link requests" value={data ? n(data.players.rainbetPending) : '…'} tone={data?.players.rainbetPending ? 'gold' : undefined} />
        <Stat label="Active challenges" value={data ? n(data.challenges.active) : '…'} tone="gold" />
        <Stat label="Giveaway entries" value={data ? n(data.giveaway.entries) : '…'} />
      </div>

      <KickStatus />

      <Card title="Sections">
        <div className="ov-links">
          {LINKS.map((l) => (
            <button key={l.id} type="button" className="ov-link" onClick={() => open(l.id)}>
              <span className="ov-link-top">
                <span className="ov-link-label">{l.label}</span>
                {isLive(l.id) && <span className="ov-live">Live</span>}
                {l.id === 'links' && data?.players.rainbetPending > 0 && <span className="ov-wait">{n(data.players.rainbetPending)} waiting</span>}
                {l.id === 'claims' && data?.claims?.pending > 0 && <span className="ov-wait">{n(data.claims.pending)} waiting</span>}
                {l.id === 'shop' && data?.shop?.pending > 0 && <span className="ov-wait">{n(data.shop.pending)} waiting</span>}
                {l.id === 'wager-store' && data?.wagerStore?.pending > 0 && <span className="ov-wait">{n(data.wagerStore.pending)} waiting</span>}
              </span>
              <span className="ov-link-sub">{summary ? summary[l.id] : 'Loading…'}</span>
              <span className="ov-link-go" aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      </Card>

      <DiscordAlerts />
    </>
  )
}

/** The admins' Discord channel (server/notify.js): is the webhook set, and a test message */
function DiscordAlerts() {
  const [enabled, setEnabled] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    apiGet('/api/admin/notify').then((d) => setEnabled(d.enabled), () => setEnabled(false))
  }, [])

  const test = async () => {
    setBusy(true)
    setMsg('')
    setError('')
    try {
      await apiPost('/api/admin/notify/test')
      setMsg('Sent. Check the channel.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      title="Discord alerts"
      actions={
        enabled && (
          <Button onClick={test} busy={busy}>
            Send test
          </Button>
        )
      }
    >
      <p className="ov-alerts">
        {enabled === null
          ? 'Checking…'
          : enabled
            ? 'New claims, Rainbet link requests and store orders are posted to the admins’ Discord channel.'
            : 'Off. Set DISCORD_ADMIN_WEBHOOK in the server’s .env to a Discord webhook URL, then restart the server.'}
        {msg && <span className="ov-alerts-ok"> {msg}</span>}
      </p>
      <ErrorLine>{error}</ErrorLine>
    </Card>
  )
}
