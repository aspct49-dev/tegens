import { useEffect, useState } from 'react'
import { apiGet, apiPost } from '../api'
import { Button, Card, ConfirmButton, Empty, ErrorLine, Field, Input, SectionIntro } from '../ui'
import './site.css'

// Moderators (admins only): Kick accounts that get a smaller panel. What a mod can open is
// fixed in server/mods.js (MOD_ROUTES) and AdminPage.jsx (sections marked `mod`).
//
//   GET  /api/admin/mods                        → { mods }
//   POST /api/admin/mods { add } | { remove }   → { mods }

const CAN = [
  'Claims: approve (Paid) or reject milestone and challenge claims, and undo',
  'Milestone Claims: look a player up and mark a milestone paid, or undo it',
  'Links: approve, reject, re-check or unlink Rainbet link requests (not set a link by hand)',
  'Bonus Hunt, Guess the Balance, Tournaments, Chat Giveaway, Giveaway Wins, Slot Picker, Overlays',
  'Raffles: lock, draw, reroll and finish (not create, change, unlock or delete)',
  'Slot Calls',
]
const CANT =
  'Overview, Players, Botrix Points, Wager Stats, both stores, Challenges, Biggest Wins, VIPs, the Activity log and this page.'

const since = (t) => (t ? new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

export default function ModsAdmin() {
  const [mods, setMods] = useState(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    apiGet('/api/admin/mods').then((d) => setMods(d.mods), (err) => setError(err.message))
  }, [])

  const send = async (body, key) => {
    setBusy(key)
    setError('')
    try {
      const d = await apiPost('/api/admin/mods', body)
      setMods(d.mods)
      if (body.add) setName('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      <SectionIntro>
        Mods sign in with their Kick account and get a smaller panel: claims, milestone claims, Rainbet links and the stream tools. The server enforces it, so the rest stays closed even
        if they type an address. What they do still shows in the Activity log under their name.
      </SectionIntro>

      <Card title="Add a mod">
        <form
          className="adm-row"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) send({ add: name.trim() }, 'add')
          }}
        >
          <Field label="Kick username">
            <Input value={name} onChange={setName} placeholder="e.g. TegensMod" maxLength={25} aria-label="Kick username" />
          </Field>
          <Button kind="primary" type="submit" busy={busy === 'add'} disabled={!name.trim()}>
            Make mod
          </Button>
        </form>
        <ErrorLine>{error}</ErrorLine>
      </Card>

      <Card title="Mods" actions={mods && <span className="pl-count">{mods.length}</span>}>
        {!mods ? (
          <span className="adm-spin adm-spin-inline" aria-label="Loading" />
        ) : mods.length === 0 ? (
          <Empty>No mods yet.</Empty>
        ) : (
          <div className="pl-table-wrap">
            <table className="adm-table lk-table">
              <thead>
                <tr>
                  <th>Kick</th>
                  <th>Added</th>
                  <th className="is-num" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {mods.map((m) => (
                  <tr key={m.kick}>
                    <td className="pl-name">{m.name}</td>
                    <td className="lk-sub">
                      {since(m.at)}
                      {m.addedBy ? ` by ${m.addedBy}` : ''}
                    </td>
                    <td className="is-num">
                      <ConfirmButton kind="ghost" busy={busy === m.kick} confirmLabel="Remove?" onConfirm={() => send({ remove: m.kick }, m.kick)}>
                        Remove
                      </ConfirmButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="What a mod can do">
        <ul className="adm-mod-can">
          {CAN.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p className="lk-sub">Not: {CANT}</p>
      </Card>
    </>
  )
}
