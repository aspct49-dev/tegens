import { useEffect, useRef, useState } from 'react'
import { config } from '../config'
import { useAuth } from '../hooks/useAuth'
import PageHeading, { PageBackdrop } from '../components/PageHeading'
import '../contact.css'

// /contact: a message to the TEGENS team. It's delivered to the admins' Discord channel
// (server/features/contact.js); "Sent" only shows once the server confirms delivery.

const TOPICS = [
  ['general', 'General question'],
  ['prize', 'A prize, claim or order'],
  ['account', 'My account or my data'],
  ['partner', 'Partnership or business'],
  ['bug', 'Something on the site is broken'],
]
const MAX = 2000
const EMPTY = { name: '', reply: '', topic: '', message: '', website: '' }
const EMAIL = /^[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}$/i

function check(f) {
  const e = {}
  const reply = f.reply.trim()
  if (reply.length < 3) e.reply = 'Tell us how to reply: an email address, or your Discord or Kick username.'
  else if (reply.indexOf('@') > 0 && !EMAIL.test(reply)) e.reply = 'That email address doesn’t look right.'
  if (!f.topic) e.topic = 'Pick what your message is about.'
  if (f.message.trim().length < 10) e.message = 'Write a little more (at least 10 characters).'
  else if (f.message.length > MAX) e.message = `Keep it under ${MAX.toLocaleString('en-US')} characters.`
  return e
}

export default function ContactPage() {
  const { user } = useAuth()
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState('idle') // idle | sending | sent
  const [failure, setFailure] = useState('')
  const started = useRef(Math.floor(Date.now() / 1000))
  const refs = { reply: useRef(), topic: useRef(), message: useRef() }
  const doneRef = useRef()

  // a signed-in player's Kick name is a fine way to reply
  useEffect(() => {
    const kick = user?.kick?.username
    if (kick) setForm((f) => (f.reply ? f : { ...f, reply: kick }))
  }, [user])

  useEffect(() => {
    if (status === 'sent') doneRef.current?.focus()
  }, [status])

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }))
  }

  const submit = async (e) => {
    e.preventDefault()
    const found = check(form)
    setErrors(found)
    setFailure('')
    const first = ['reply', 'topic', 'message'].find((k) => found[k])
    if (first) return refs[first].current?.focus()
    setStatus('sending')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, startedAt: started.current }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `The message couldn’t be sent (error ${res.status}).`)
      setStatus('sent')
    } catch (err) {
      setFailure(err.message === 'Failed to fetch' ? 'You seem to be offline. Check your connection and try again.' : err.message)
      setStatus('idle')
    }
  }

  const field = (k) => ({ 'aria-invalid': errors[k] ? 'true' : undefined, 'aria-describedby': errors[k] ? `ct-${k}-err` : undefined })

  return (
    <div className="titled-page">
      <PageBackdrop />
      <PageHeading top="CONTACT" bottom="US" wordmark={false}>
        Questions about a prize, your account or working with us?
        {' '}<br />
        Send the team a message.
      </PageHeading>

      <div className="ct enter" style={{ '--d': '160ms' }}>
        {status === 'sent' ? (
          <div className="ct-card ct-done" tabIndex={-1} ref={doneRef} role="status">
            <h2>Message sent</h2>
            <p>Thanks. The team has your message and will reply to <b>{form.reply.trim()}</b> as soon as they can.</p>
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setForm({ ...EMPTY, reply: form.reply })
                started.current = Math.floor(Date.now() / 1000)
                setStatus('idle')
              }}
            >
              Send another message
            </button>
          </div>
        ) : (
          <form className="ct-card ct-form" onSubmit={submit} noValidate>
            <div className="ct-row">
              <label className="ct-field">
                <span>
                  Name <small>(optional)</small>
                </span>
                <input value={form.name} onChange={set('name')} maxLength={60} autoComplete="name" />
              </label>
              <label className="ct-field">
                <span>How should we reply?</span>
                <input
                  ref={refs.reply}
                  value={form.reply}
                  onChange={set('reply')}
                  maxLength={100}
                  required
                  placeholder="Email, or Discord / Kick username"
                  autoComplete="email"
                  spellCheck="false"
                  {...field('reply')}
                />
                {errors.reply && <small className="ct-err" id="ct-reply-err">{errors.reply}</small>}
              </label>
            </div>
            <label className="ct-field">
              <span>What’s it about?</span>
              <select ref={refs.topic} value={form.topic} onChange={set('topic')} required {...field('topic')}>
                <option value="" disabled>
                  Choose a topic
                </option>
                {TOPICS.map(([id, label]) => (
                  <option value={id} key={id}>
                    {label}
                  </option>
                ))}
              </select>
              {errors.topic && <small className="ct-err" id="ct-topic-err">{errors.topic}</small>}
            </label>
            <label className="ct-field">
              <span>Message</span>
              <textarea ref={refs.message} value={form.message} onChange={set('message')} rows={7} maxLength={MAX} required {...field('message')} />
              <small className="ct-count" aria-live="polite">
                {form.message.length.toLocaleString('en-US')} / {MAX.toLocaleString('en-US')}
              </small>
              {errors.message && <small className="ct-err" id="ct-message-err">{errors.message}</small>}
            </label>
            {/* left empty by people; bots that fill every field are turned away */}
            <div className="ct-hp" aria-hidden="true">
              <label>
                Website
                <input value={form.website} onChange={set('website')} tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            {failure && (
              <p className="ct-failure" role="alert">
                {failure}
              </p>
            )}
            <button className="btn-blue ct-submit" type="submit" disabled={status === 'sending'} aria-busy={status === 'sending'}>
              {status === 'sending' ? 'Sending…' : 'Send message'}
            </button>
          </form>
        )}

        <aside className="ct-aside">
          <h2>Other ways to reach us</h2>
          <p>
            For the quickest answer, open a ticket in our{' '}
            <a href={config.discordUrl} target="_blank" rel="noopener noreferrer">
              Discord server
            </a>{' '}
            or message us on{' '}
            <a href={config.kickUrl} target="_blank" rel="noopener noreferrer">
              Kick
            </a>
            .
          </p>
          <p>
            Deposits, withdrawals, verification or self-exclusion on {config.casino} go to {config.casino}’s own support: we can’t see or change
            your casino account.
          </p>
        </aside>
      </div>
    </div>
  )
}
