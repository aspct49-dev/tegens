import { useEffect, useState } from 'react'
import { usePolled } from '../hooks/usePolled'
import { apiPost } from './api'
import { Button, Card, ConfirmButton, ErrorLine, Pill } from './ui'
import './kick.css'

// Kick chat + bot connection card (server/kick/): is the channel found, is it
// live, is the chat socket up, is Kick's webhook subscribed, and which account
// the bot posts as, with the buttons to fix each.

const ago = (ms) => {
  if (!ms) return 'never'
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

const SOCKET = {
  on: ['ok', 'Connected'],
  connecting: ['warn', 'Connecting'],
  'no-channel': ['warn', 'No channel'],
  off: ['off', 'Off'],
}

function Tile({ label, pill, value, detail, bad }) {
  return (
    <div className="kick-tile">
      <div className="kick-tile-head">
        <span className="kick-tile-label">{label}</span>
        {pill}
      </div>
      {value != null && <span className="kick-tile-value">{value}</span>}
      {detail && <span className={`kick-tile-detail${bad ? ' is-bad' : ''}`}>{detail}</span>}
    </div>
  )
}

/** The OAuth callback comes back with ?bot_error=…: show it once, then tidy the URL */
function useBotReturnError() {
  const [error] = useState(() => new URLSearchParams(window.location.search).get('bot_error') ?? '')
  useEffect(() => {
    if (!error) return
    const url = new URL(window.location.href)
    url.searchParams.delete('bot_error')
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  }, [error])
  return error
}

export default function KickStatus() {
  const { data, error: loadError, reload } = usePolled('/api/admin/kick/status', 5000)
  const returnError = useBotReturnError()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const act = (name, path) => async () => {
    setBusy(name)
    setError('')
    try {
      await apiPost(path)
      reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const s = data
  const socket = SOCKET[s?.socket?.state] ?? SOCKET.off
  const bot = s?.bot

  return (
    <Card
      className="kick-card"
      title="Kick chat"
      actions={<Button busy={busy === 'reconnect'} onClick={act('reconnect', '/api/admin/kick/reconnect')}>Reconnect chat</Button>}
    >
      {!s ? (
        <p className="kick-tile-detail">{loadError ? '' : 'Loading…'}</p>
      ) : (
        <div className="adm-grid">
          <Tile
            label="Channel"
            pill={<Pill tone={s.channel.chatroomId ? 'ok' : 'warn'}>{s.channel.chatroomId ? 'Found' : 'Not found'}</Pill>}
            value={`kick.com/${s.channel.slug}`}
            detail={s.channel.error ?? `Chatroom ${s.channel.chatroomId}`}
            bad={Boolean(s.channel.error)}
          />
          <Tile
            label="Stream"
            pill={<Pill tone={s.live.live ? 'live' : 'off'}>{s.live.live ? 'Live' : 'Offline'}</Pill>}
            value={s.live.live ? `${s.live.viewers ?? 0} watching` : 'Offline'}
            detail={s.live.live ? s.live.title : `Checked ${ago(s.live.checkedAt)}`}
          />
          <Tile
            label="Chat socket"
            pill={<Pill tone={socket[0]}>{socket[1]}</Pill>}
            value={`${s.socket.messages} messages`}
            detail={s.socket.state !== 'on' && s.socket.error ? s.socket.error : `Last message ${ago(s.socket.lastMessageAt)}`}
            bad={s.socket.state !== 'on' && Boolean(s.socket.error)}
          />
          <Tile
            label="Webhook"
            pill={
              <Pill tone={s.webhook.subscribed && !s.webhook.error ? 'ok' : s.webhook.configured ? 'warn' : 'off'}>
                {s.webhook.subscribed ? 'Subscribed' : s.webhook.configured ? 'Not subscribed' : 'Not set up'}
              </Pill>
            }
            value={`${s.webhook.messages} messages`}
            detail={s.webhook.error ?? `Last message ${ago(s.webhook.lastMessageAt)} · checked ${ago(s.webhook.checkedAt)}`}
            bad={Boolean(s.webhook.error)}
          />
          <Tile
            label="Bot"
            pill={<Pill tone={bot?.connected ? (bot.error ? 'warn' : 'ok') : 'off'}>{bot?.connected ? 'Connected' : 'Not connected'}</Pill>}
            value={bot?.connected ? bot.username : 'No bot account'}
            detail={bot?.error ?? (bot?.connected ? `Sent ${bot.sent} · last ${ago(bot.lastSentAt)}` : 'Connect a Kick account to post in chat.')}
            bad={Boolean(bot?.error)}
          />
          <Tile label="Chatters" value={`${s.chatters.today} today`} detail={`${s.chatters.total} remembered`} />
        </div>
      )}

      <div className="adm-row kick-actions">
        {bot?.connected ? (
          <>
            <Button kind="primary" busy={busy === 'test'} onClick={act('test', '/api/admin/kick/bot/test')}>
              Send test message
            </Button>
            <ConfirmButton busy={busy === 'disconnect'} onConfirm={act('disconnect', '/api/admin/kick/bot/disconnect')}>
              Disconnect bot
            </ConfirmButton>
          </>
        ) : (
          <Button kind="primary" onClick={() => window.location.assign('/api/admin/kick/bot/connect')}>
            Connect bot account
          </Button>
        )}
      </div>

      <ErrorLine>{error || returnError || loadError}</ErrorLine>

      <p className="kick-help">
        The Kick app needs the scopes <code>user:read</code>, <code>chat:write</code> and <code>events:subscribe</code>, the webhook URL{' '}
        <code>https://tegens.bet/api/kick/webhook</code>, and <code>/api/kick/bot/callback</code> as a redirect URL. Connect the bot with a
        separate Kick account (e.g. TegensBot): sign in to Kick as that account first, then press Connect.
      </p>
    </Card>
  )
}
