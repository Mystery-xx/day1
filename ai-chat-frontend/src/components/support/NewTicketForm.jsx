import { useState } from 'react'

const PRIORITY_OPTIONS = [
  { value: 'LOW',      label: 'Низкий' },
  { value: 'MEDIUM',   label: 'Средний' },
  { value: 'HIGH',     label: 'Высокий' },
  { value: 'CRITICAL', label: 'Критичный' },
]

export default function NewTicketForm({ onSubmit, onCancel }) {
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('MEDIUM')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!subject.trim()) {
      setError('Пожалуйста, укажите тему тикета')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      await onSubmit({ subject: subject.trim(), description: description.trim(), priority })
    } catch (err) {
      setError(err.message || 'Ошибка при создании тикета')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="new-ticket-form">
      <h3 className="new-ticket-form-title">Новый тикет</h3>

      {error && (
        <div className="new-ticket-form-error">{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="new-ticket-form-field">
          <label className="new-ticket-form-label" htmlFor="ticket-subject">
            Тема
          </label>
          <input
            id="ticket-subject"
            className="new-ticket-form-input"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Краткое описание проблемы"
            disabled={isSubmitting}
            autoFocus
          />
        </div>

        <div className="new-ticket-form-field">
          <label className="new-ticket-form-label" htmlFor="ticket-description">
            Описание
          </label>
          <textarea
            id="ticket-description"
            className="new-ticket-form-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Подробное описание проблемы..."
            rows={5}
            disabled={isSubmitting}
          />
        </div>

        <div className="new-ticket-form-field">
          <label className="new-ticket-form-label" htmlFor="ticket-priority">
            Приоритет
          </label>
          <select
            id="ticket-priority"
            className="new-ticket-form-select"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            disabled={isSubmitting}
          >
            {PRIORITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="new-ticket-form-actions">
          <button
            type="button"
            className="new-ticket-form-cancel"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Отмена
          </button>
          <button
            type="submit"
            className="new-ticket-form-submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Создание...' : 'Создать'}
          </button>
        </div>
      </form>
    </div>
  )
}
