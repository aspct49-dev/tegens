import { useRef } from 'react'
import { config } from '../config'
import Modal from './Modal'

// Claims and redemptions are fulfilled by staff, so each one ends in a
// Discord ticket. `ticket` = { title, body, cta } or null when closed.
export default function TicketModal({ ticket: current, onClose }) {
  // Keep showing the last ticket while the dialog fades out.
  const last = useRef(null)
  if (current) last.current = current
  const ticket = current || last.current
  return (
    <Modal open={Boolean(current)} onClose={onClose} labelledBy="ticket-title" className="ticket-modal">
      {ticket && (
        <>
          <h2 id="ticket-title">{ticket.title}</h2>
          <div className="ticket-body">{ticket.body}</div>
          <a className="btn-blue ticket-cta" href={config.discordUrl} target="_blank" rel="noopener noreferrer" onClick={onClose}>
            {ticket.cta || 'Create a ticket on Discord'}
          </a>
          <p className="modal-note">Tickets are answered by the TEGENS team. Have your Rainbet username ready.</p>
        </>
      )}
    </Modal>
  )
}
