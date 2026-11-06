import { useEffect, useRef, useState } from 'react'
import { config } from '../config'
import { usePlayer } from '../hooks/usePlayer'
import { getProgress } from '../milestones'
import { fmtMoney } from '../utils'
import Modal from './Modal'
import { Link } from '../router'

const fmtDate = (d) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

// Look up a Rainbet username's lifetime wager under the code. The result
// drives the side-nav rank card and the Milestones page.
export default function PlayerModal({ open, onClose }) {
  const player = usePlayer()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef()

  useEffect(() => {
    if (!open) return
    setError('')
    setValue('')
    // After the shell has moved focus to its close button.
    const t = setTimeout(() => inputRef.current?.focus(), 260)
    return () => clearTimeout(t)
  }, [open])

  const submit = async (e) => {
    e.preventDefault()
    const name = value.trim()
    if (!name) return setError('Enter your Rainbet username.')
    setBusy(true)
    setError('')
    try {
      const r = await player.signIn(name)
      if (r.found) onClose()
      else setError(`No wagers found for “${name}” under code ${config.referralCode} yet.`)
    } catch {
      setError('Rainbet is not responding right now. Please try again in a minute.')
    } finally {
      setBusy(false)
    }
  }

  const { current, next } = getProgress(player.wagered)

  return (
    <Modal open={open} onClose={onClose} labelledBy="player-title" className="player-modal">
      <h2 id="player-title">Track your rank</h2>
      {player.known && (
        <div className="player-summary">
          <img src={(current || config.milestones.tiers[0]).icon} width="44" height="44" alt="" className={current ? '' : 'dim'} />
          <div>
            <p className="player-name">{player.username}</p>
            <p className="player-meta">
              {fmtMoney(player.wagered, 2)} wagered · {current ? current.name : 'Unranked'}
              {next ? ` · ${fmtMoney(next.wager - player.wagered)} to ${next.name}` : ' · Top rank reached'}
            </p>
          </div>
        </div>
      )}
      {player.accountManaged ? (
        <p className="modal-note">
          {player.known
            ? 'This is the Rainbet username linked to your account. To change it, '
            : 'Link your Rainbet username to your account to track your rank here. Once it’s approved it shows up here. '}
          <Link to="/profile" onClick={onClose}>
            {player.known ? 'go to your profile' : 'Link it on your profile'}
          </Link>
          .
        </p>
      ) : (
      <form className="player-form" onSubmit={submit}>
        <label htmlFor="player-name">{player.known ? 'Switch to another username' : 'Rainbet username'}</label>
        <div className="player-row">
          <input
            id="player-name"
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. Tegenspro123"
            autoComplete="off"
            spellCheck="false"
            maxLength={40}
          />
          <button className="btn-blue" type="submit" disabled={busy}>
            {busy ? 'Checking…' : 'Check'}
          </button>
        </div>
        <p className="player-error" role="alert">{error}</p>
      </form>
      )}
      <p className="modal-note">
        Counts wagers made under code <b>{config.referralCode}</b> since {fmtDate(config.milestones.trackSince)}.
        {player.known && !player.accountManaged && (
          <>
            {' '}
            <button type="button" className="link-btn" onClick={() => { player.signOut(); onClose() }}>
              Forget this username
            </button>
          </>
        )}
      </p>
    </Modal>
  )
}
