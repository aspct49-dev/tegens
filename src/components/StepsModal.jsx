import Modal from './Modal'
import { StepCard } from '../pages/MilestonesPage'

// "How it works" popup: a page's three step cards (the same StepCard as Milestones) in a
// dialog, opened from the Rules button next to "Visit Rainbet" (Raffles, Challenges).
//   steps: [{ title, image, text }]   rules: optional list of extra rule lines under the cards
export default function StepsModal({ open, onClose, title, steps, rules }) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="steps-title" className="steps-modal">
      <h2 id="steps-title">{title}</h2>
      <div className="step-grid steps-modal-grid">
        {steps.map((s, i) => (
          <StepCard title={s.title} image={s.image} index={i} key={s.title}>
            {s.text}
          </StepCard>
        ))}
      </div>
      {rules?.length > 0 && (
        <ul className="steps-modal-rules">
          {rules.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      <p className="modal-note">18+ only. Please gamble responsibly.</p>
    </Modal>
  )
}
