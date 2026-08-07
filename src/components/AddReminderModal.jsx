import { useState } from 'react';
import { CATEGORIES, CATEGORY_ORDER } from '../categories';
import { SOUND_OPTIONS } from '../services/notificationPrefs';
import { previewAlarm } from '../services/alarmService';
import './AddReminderModal.css';

const emptyState = {
  title: '', priority: 'MEDIUM', notes: '', alarmSound: 'default',
  // debt
  amount: '', currency: 'UGX', counterparty: '', interestRate: '', triggerAt: '',
  // medicine — frequencyValue is entered by the user, frequencyUnit picks
  // whether that number means hours or minutes (needed for things like
  // "every 30 minutes", which the old hours-only field couldn't express).
  dosage: '', frequencyValue: '', frequencyUnit: 'hours', courseDurationDays: '', refillThreshold: '',
  // meeting
  location: '', link: '', attendees: '', durationMins: '', leadTimeMins: '15',
  // idea
  note: '', tags: '', resurfaceIntervalDays: '7',
};

export default function AddReminderModal({ onClose, onCreate }) {
  const [category, setCategory] = useState('DEBT');
  const [form, setForm] = useState(emptyState);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const cat = CATEGORIES[category];

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = buildPayload(category, form);
      await onCreate(payload);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ '--accent': cat.accent }} onClick={(e) => e.stopPropagation()}>
        <div className="modal__topedge" />
        <div className="modal__hole" />

        <div className="modal__tabs">
          {CATEGORY_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              className={`modal__tabbtn ${category === key ? 'is-active' : ''}`}
              style={{ '--tab-accent': CATEGORIES[key].accent }}
              onClick={() => setCategory(key)}
            >
              {CATEGORIES[key].tab} · {CATEGORIES[key].label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="modal__form">
          <label className="field">
            <span>Title</span>
            <input required value={form.title} onChange={set('title')} placeholder="A short name for this card" />
          </label>

          <CategoryFields category={category} form={form} set={set} />

          <label className="field">
            <span>Priority</span>
            <select value={form.priority} onChange={set('priority')}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </label>

          <label className="field">
            <span>Alarm sound</span>
            <div className="field-row field-row--sound">
              <select value={form.alarmSound} onChange={set('alarmSound')}>
                <option value="default">Use category default</option>
                {SOUND_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
              <button
                type="button"
                className="card__btn card__btn--ghost field-row__preview"
                onClick={() => previewAlarm(form.alarmSound === 'default' ? 'classic' : form.alarmSound)}
                disabled={form.alarmSound === 'silent'}
              >
                ▶ Preview
              </button>
            </div>
          </label>

          <label className="field">
            <span>Notes (optional)</span>
            <textarea rows={2} value={form.notes} onChange={set('notes')} />
          </label>

          {error && <div className="modal__error">{error}</div>}

          <div className="modal__actions">
            <button type="button" className="card__btn card__btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="card__btn" disabled={submitting}>
              {submitting ? 'Filing…' : 'File this card'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CategoryFields({ category, form, set }) {
  switch (category) {
    case 'DEBT':
      return (
        <>
          <div className="field-row">
            <label className="field">
              <span>Amount</span>
              <input required type="number" min="0" value={form.amount} onChange={set('amount')} />
            </label>
            <label className="field field--small">
              <span>Currency</span>
              <input value={form.currency} onChange={set('currency')} />
            </label>
          </div>
          <label className="field">
            <span>Counterparty</span>
            <input required value={form.counterparty} onChange={set('counterparty')} placeholder="Who it's owed to/by" />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Interest rate % (optional)</span>
              <input type="number" min="0" value={form.interestRate} onChange={set('interestRate')} />
            </label>
            <label className="field">
              <span>Due date & time</span>
              <input type="datetime-local" step="1" value={form.triggerAt} onChange={set('triggerAt')} />
            </label>
          </div>
        </>
      );
    case 'MEDICINE':
      return (
        <>
          <label className="field">
            <span>Dosage</span>
            <input required value={form.dosage} onChange={set('dosage')} placeholder="e.g. 500mg" />
          </label>
          <div className="field-row">
            <label className="field field--small">
              <span>Every</span>
              <input required type="number" min="1" value={form.frequencyValue} onChange={set('frequencyValue')} placeholder="e.g. 30" />
            </label>
            <label className="field field--small">
              <span>Unit</span>
              <select value={form.frequencyUnit} onChange={set('frequencyUnit')}>
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
              </select>
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Course length (days, optional)</span>
              <input type="number" min="1" value={form.courseDurationDays} onChange={set('courseDurationDays')} />
            </label>
            <label className="field">
              <span>Refill alert (doses left, optional)</span>
              <input type="number" min="1" value={form.refillThreshold} onChange={set('refillThreshold')} />
            </label>
          </div>
        </>
      );
    case 'MEETING':
      return (
        <>
          <label className="field">
            <span>Date & time</span>
            <input required type="datetime-local" step="1" value={form.triggerAt} onChange={set('triggerAt')} />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Location (optional)</span>
              <input value={form.location} onChange={set('location')} />
            </label>
            <label className="field">
              <span>Link (optional)</span>
              <input value={form.link} onChange={set('link')} />
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Duration, mins (optional)</span>
              <input type="number" min="1" value={form.durationMins} onChange={set('durationMins')} />
            </label>
            <label className="field field--small">
              <span>Alert before (mins)</span>
              <input type="number" min="0" value={form.leadTimeMins} onChange={set('leadTimeMins')} />
            </label>
          </div>
        </>
      );
    case 'IDEA':
      return (
        <>
          <label className="field">
            <span>The idea</span>
            <textarea required rows={3} value={form.note} onChange={set('note')} />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Tags (optional)</span>
              <input value={form.tags} onChange={set('tags')} placeholder="comma, separated" />
            </label>
            <label className="field field--small">
              <span>Resurface every (days)</span>
              <input type="number" min="1" value={form.resurfaceIntervalDays} onChange={set('resurfaceIntervalDays')} />
            </label>
          </div>
        </>
      );
    default:
      return null;
  }
}

function buildPayload(category, form) {
  const base = {
    title: form.title,
    category,
    priority: form.priority,
    notes: form.notes || undefined,
    alarmSound: form.alarmSound || 'default',
  };
  switch (category) {
    case 'DEBT':
      return {
        ...base,
        amount: Number(form.amount),
        currency: form.currency || 'UGX',
        counterparty: form.counterparty,
        interestRate: form.interestRate ? Number(form.interestRate) : undefined,
        triggerAt: form.triggerAt ? new Date(form.triggerAt).toISOString() : undefined,
      };
    case 'MEDICINE': {
      // The service layer still stores frequency as (possibly fractional)
      // hours, so "every 30 minutes" becomes 0.5 — this is what actually
      // unlocks minute-level dosing schedules without touching the schema.
      const raw = Number(form.frequencyValue);
      const frequencyHours = form.frequencyUnit === 'minutes' ? raw / 60 : raw;
      return {
        ...base,
        dosage: form.dosage,
        frequencyHours,
        courseDurationDays: form.courseDurationDays ? Number(form.courseDurationDays) : undefined,
        refillThreshold: form.refillThreshold ? Number(form.refillThreshold) : undefined,
      };
    }
    case 'MEETING':
      return {
        ...base,
        triggerAt: new Date(form.triggerAt).toISOString(),
        location: form.location || undefined,
        link: form.link || undefined,
        attendees: form.attendees || undefined,
        durationMins: form.durationMins ? Number(form.durationMins) : undefined,
        leadTimeMins: form.leadTimeMins ? Number(form.leadTimeMins) : 15,
      };
    case 'IDEA':
      return {
        ...base,
        note: form.note,
        tags: form.tags || undefined,
        resurfaceIntervalDays: form.resurfaceIntervalDays ? Number(form.resurfaceIntervalDays) : 7,
      };
    default:
      return base;
  }
}
