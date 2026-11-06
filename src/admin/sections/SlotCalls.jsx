import { useEffect, useState } from 'react'
import { apiPost } from '../api'
import { usePolled } from '../../hooks/usePolled'
import SlotPicker from '../SlotPicker'
import { Button, Card, ConfirmButton, Empty, ErrorLine, Field, Input, Pill, SectionIntro, Toggle, num } from '../ui'
import VipBadge from '../../components/VipBadge'
import './vip-admin.css'

// Slot calls: viewers (or only VIPs, with "VIPs only" on) type !call <slot> in Kick chat,
// the server matches the slot and queues it (even with this tab closed). Play a call to put
// it on /overlay/calls, then record what it won: a VIP's wins feed their stats in admin → VIPs.

const API = '/api/admin/calls'

const usd = (n) => `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const when = (s) => new Date(s * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const multi = (c) => (c.bet ? `${(Math.round((c.win / c.bet) * 100) / 100).toLocaleString('en-US')}x` : null)

function Art({ slot, w, h }) {
  return slot.image ? <img className="vc-art" src={slot.image} width={w} height={h} alt="" loading="lazy" /> : <span className="vc-art is-empty" style={{ width: w, height: h }} />
}

export default function SlotCallsAdmin() {
  const polled = usePolled(API, 2000)
  const [snap, setSnap] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (polled.data) setSnap(polled.data)
  }, [polled.data])

  const act = async (route, body = {}, tag = route) => {
    setBusy(tag)
    setError('')
    try {
      const d = await apiPost(`${API}/${route}`, body)
      setSnap(d)
      polled.reload()
      return d
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setBusy('')
    }
  }

  if (!snap) return polled.error ? <ErrorLine>{polled.error}</ErrorLine> : <span className="adm-spin adm-spin-inline" aria-label="Loading" />

  const current = snap.calls.find((c) => c.id === snap.currentId) ?? null
  const waiting = snap.calls.filter((c) => c.status === 'waiting' && c.id !== snap.currentId)
  const finished = snap.calls.filter((c) => c.status !== 'waiting' && c.id !== snap.currentId).reverse()

  return (
    <>
      <SectionIntro>
        Viewers type <b>!call &lt;slot name&gt;</b> in Kick chat. Turn on <b>VIPs only</b> to take calls from VIPs alone. Each viewer has one
        waiting call (calling again changes it). Play a call to show it on the <b>/overlay/calls</b> browser source, then record what it won.
        VIP callers carry the VIP tag, and their wins count in their VIP stats.
      </SectionIntro>

      <Card
        title="Calls"
        actions={snap.open ? <Pill tone="live">{snap.vipOnly ? 'Taking VIP calls' : 'Taking calls'}</Pill> : <Pill tone="off">Calls closed</Pill>}
      >
        <div className="vc-settings">
          <Toggle checked={snap.open} onChange={(v) => act('settings', { open: v }, 'open')} label="Take slot calls in chat" />
          <Toggle checked={snap.vipOnly} onChange={(v) => act('settings', { vipOnly: v }, 'vipOnly')} label="VIPs only" />
          <Toggle checked={snap.announce} onChange={(v) => act('settings', { announce: v }, 'announce')} label="Bot confirms calls and posts results" />
        </div>
      </Card>
      <ErrorLine>{error}</ErrorLine>

      <Card
        title="Now playing"
        actions={
          <>
            {current && (
              <Button disabled={busy !== ''} onClick={() => act('hide')}>
                Hide from overlay
              </Button>
            )}
            <Button kind="gold" busy={busy === 'next'} disabled={busy !== '' || !waiting.length} onClick={() => act('next')}>
              {current ? 'Next call' : 'Play next call'}
            </Button>
          </>
        }
      >
        {current ? <Current key={current.id} c={current} act={act} busy={busy} /> : <Empty>{waiting.length ? 'Nothing on the overlay. Play the next call.' : 'No calls waiting.'}</Empty>}
      </Card>

      <Card title={`Waiting · ${waiting.length}`}>
        {waiting.length === 0 ? (
          <Empty>{snap.open ? `No calls yet. ${snap.vipOnly ? 'VIPs call' : 'Viewers call'} with !call <slot> in chat.` : 'Calls are closed.'}</Empty>
        ) : (
          <ol className="vc-list">
            {waiting.map((c, i) => (
              <li key={c.id} className="vc-row">
                <span className="vc-n">{i + 1}</span>
                <Art slot={c.slot} w={30} h={40} />
                <span className="vc-text">
                  <span className="vc-slot">
                    {c.slot.name}
                    {!c.matched && <Pill tone="warn">Not in slot list</Pill>}
                  </span>
                  <span className="vc-by">
                    {c.username}
                    {c.vip && <VipBadge force />} · {when(c.at)}
                    {c.slot.provider ? ` · ${c.slot.provider}` : ''}
                  </span>
                </span>
                <span className="vc-btns">
                  <Button kind="primary" disabled={busy !== ''} onClick={() => act(`${c.id}/play`)}>
                    Play
                  </Button>
                  <Button disabled={busy !== ''} onClick={() => act(`${c.id}/skip`)}>
                    Skip
                  </Button>
                  <ConfirmButton disabled={busy !== ''} confirmLabel="Delete?" onConfirm={() => act(`${c.id}/delete`)}>
                    Delete
                  </ConfirmButton>
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <AddCall act={act} busy={busy === 'add'} />

      {finished.length > 0 && (
        <Card
          title={`Finished · ${finished.length}`}
          actions={
            <ConfirmButton kind="ghost" disabled={busy !== ''} confirmLabel="Clear finished? Stats stay." onConfirm={() => act('clear')}>
              Clear finished
            </ConfirmButton>
          }
        >
          <ul className="vc-list">
            {finished.map((c) => (
              <li key={c.id} className="vc-row">
                <Art slot={c.slot} w={30} h={40} />
                <span className="vc-text">
                  <span className="vc-slot">{c.slot.name}</span>
                  <span className="vc-by">
                    {c.username}
                    {c.vip && <VipBadge force />}
                  </span>
                </span>
                {c.status === 'done' ? (
                  <span className="vc-result">
                    <b className="vip-gold">{usd(c.win)}</b>
                    {c.bet ? <span className="vip-dim"> on {usd(c.bet)} · {multi(c)}</span> : null}
                  </span>
                ) : (
                  <Pill tone="off">Skipped</Pill>
                )}
                <span className="vc-btns">
                  <Button disabled={busy !== ''} onClick={() => act(`${c.id}/reopen`)} title="Back into the queue (its recorded win is removed)">
                    Reopen
                  </Button>
                  <ConfirmButton disabled={busy !== ''} confirmLabel="Delete?" onConfirm={() => act(`${c.id}/delete`)}>
                    Delete
                  </ConfirmButton>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}

// ---------------------------------------------------------------- now playing

function Current({ c, act, busy }) {
  const [bet, setBet] = useState(c.bet != null ? String(c.bet) : '')
  const [win, setWin] = useState(c.win != null ? String(c.win) : '')
  const [error, setError] = useState('')
  const save = async (e) => {
    e.preventDefault()
    const w = num(win)
    const b = bet.trim() ? num(bet) : null
    if (w == null || w < 0) return setError('Enter what the call won (0 if nothing).')
    if (bet.trim() && (b == null || b < 0)) return setError('The bet size must be a number.')
    setError('')
    await act(`${c.id}/result`, { win: w, bet: b }, 'result')
  }
  return (
    <div className="vc-current">
      <Art slot={c.slot} w={84} h={112} />
      <div className="vc-current-body">
        <span className="vc-current-kicker">
          Called by {c.username}
          {c.vip && <VipBadge force />}
        </span>
        <span className="vc-current-name">{c.slot.name}</span>
        {c.slot.provider && <span className="vc-by">{c.slot.provider}</span>}
        {c.status === 'done' && (
          <span className="vc-current-won">
            Won <b>{usd(c.win)}</b>
            {c.bet ? ` on ${usd(c.bet)} · ${multi(c)}` : ''}
          </span>
        )}
        <form className="vc-result-form" onSubmit={save} noValidate>
          <Field label="Bet">
            <Input value={bet} onChange={setBet} unit="$" inputMode="decimal" placeholder="Optional" />
          </Field>
          <Field label="Won">
            <Input value={win} onChange={setWin} unit="$" inputMode="decimal" placeholder="0.00" />
          </Field>
          <Button kind="primary" type="submit" busy={busy === 'result'}>
            {c.status === 'done' ? 'Update result' : 'Save result'}
          </Button>
          <Button disabled={busy !== ''} onClick={() => act(`${c.id}/skip`)}>
            Skip
          </Button>
        </form>
        <ErrorLine>{error}</ErrorLine>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- add a call by hand

function AddCall({ act, busy }) {
  const [username, setUsername] = useState('')
  const [slot, setSlot] = useState(null)
  const add = async () => {
    if (!slot || !username.trim()) return
    if (await act('add', { username: username.trim(), name: slot.name, slug: slot.slug, provider: slot.provider, image: slot.image }, 'add')) {
      setSlot(null)
      setUsername('')
    }
  }
  return (
    <Card title="Add a call">
      <div className="vc-add">
        <Field label="For (Kick username)">
          <Input value={username} onChange={setUsername} placeholder="username" maxLength={25} />
        </Field>
        <Field label="Slot">
          {slot ? (
            <span className="vc-picked">
              <Art slot={slot} w={24} h={32} />
              {slot.name}
              <button type="button" className="vc-x" aria-label="Change slot" onClick={() => setSlot(null)}>
                ×
              </button>
            </span>
          ) : (
            <SlotPicker placeholder="Search slots…" onPick={setSlot} />
          )}
        </Field>
        <Button kind="primary" busy={busy} disabled={!slot || !username.trim()} onClick={add}>
          Add to queue
        </Button>
      </div>
    </Card>
  )
}
