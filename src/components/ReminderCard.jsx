import { useEffect, useRef, useState } from 'react';
import { CATEGORIES, formatMoney, formatDate, relativeDue } from '../categories';
import { addAttachment, listAttachments } from '../services/attachmentService';
import { getSpeakEnabled, speak } from '../services/notificationPrefs';
import './ReminderCard.css';

const STAMP_TEXT = { done: 'DONE', payment: 'PAID' };
const SWIPE_THRESHOLD = 88;

export default function ReminderCard({ reminder, onAction, selectable = false, selected = false, onToggleSelect }) {
  const [busy, setBusy] = useState(false);
  const [stamp, setStamp] = useState(null); // 'done' | 'payment' | null
  const [dragX, setDragX] = useState(0);
  const [speakOn, setSpeakOn] = useState(false);
  const dragState = useRef(null);

  useEffect(() => {
    getSpeakEnabled().then(setSpeakOn);
  }, []);

  function speakThis() {
    const d = reminder.details || {};
    const bits = [reminder.title];
    if (reminder.category === 'DEBT') bits.push(`${d.currency || 'UGX'} ${d.balance} owed to ${d.counterparty}`);
    else if (reminder.category === 'MEDICINE') bits.push(d.dosage);
    else if (reminder.category === 'MEETING' && d.location) bits.push(`at ${d.location}`);
    else if (reminder.category === 'IDEA') bits.push(d.note);
    if (reminder.notes) bits.push(reminder.notes);
    speak(bits.filter(Boolean).join('. '));
  }
  const cat = CATEGORIES[reminder.category];
  const due = relativeDue(reminder.trigger_at);
  const isOverdue = reminder.effective_status === 'OVERDUE';
  const isDone = reminder.status === 'DONE';

  async function run(action, payload) {
    setBusy(true);
    try {
      await onAction(reminder, action, payload);
      if (action === 'done') {
        setStamp('done');
        await sleep(650);
      } else if (action === 'payment' && payload?.amount) {
        setStamp('payment');
        await sleep(650);
      }
    } finally {
      setBusy(false);
      setStamp(null);
    }
  }

  // ── Swipe gestures: right = done, left = snooze 1h ──────────
  function onPointerDown(e) {
    if (selectable || isDone) return;
    if (e.target.closest('button, input, a, textarea')) return; // don't hijack taps on controls
    dragState.current = { startX: e.clientX, active: false };
  }
  function onPointerMove(e) {
    if (!dragState.current) return;
    const delta = e.clientX - dragState.current.startX;
    if (Math.abs(delta) > 8) dragState.current.active = true;
    if (dragState.current.active) setDragX(delta);
  }
  function onPointerUp() {
    if (!dragState.current) return;
    const wasActive = dragState.current.active;
    const finalX = dragX;
    dragState.current = null;
    setDragX(0);
    if (!wasActive) return;
    if (finalX > SWIPE_THRESHOLD) run('done');
    else if (finalX < -SWIPE_THRESHOLD) run('snooze', { minutes: 60 });
  }

  const swipeHint = dragX > 24 ? 'done' : dragX < -24 ? 'snooze' : null;

  return (
    <article
      className={`card ${isDone ? 'card--done' : ''} ${selected ? 'card--selected' : ''}`}
      style={{ '--accent': cat.accent, '--accent-soft': cat.soft, transform: dragX ? `translateX(${dragX}px)` : undefined }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <div className="card__hole" aria-hidden="true" />
      <div className="card__topedge" />

      {swipeHint && (
        <div className={`card__swipehint card__swipehint--${swipeHint}`}>
          {swipeHint === 'done' ? '✓ Done' : '💤 Snooze 1h'}
        </div>
      )}

      {stamp && (
        <div className="card__stamp" aria-hidden="true">
          {STAMP_TEXT[stamp]}
        </div>
      )}

      <header className="card__head">
        {selectable && (
          <input
            type="checkbox"
            className="card__checkbox"
            checked={selected}
            onChange={() => onToggleSelect?.(reminder.id)}
          />
        )}
        <span className="card__tab">{cat.tab}</span>
        <div className="card__headtext">
          <h3 className="card__title">{reminder.title}</h3>
          <div className="card__meta">
            {cat.label}
            {reminder.priority === 'HIGH' || reminder.priority === 'CRITICAL' ? (
              <span className={`card__priority card__priority--${reminder.priority.toLowerCase()}`}>
                {reminder.priority}
              </span>
            ) : null}
          </div>
        </div>
        {due && (
          <span className={`card__due ${isOverdue ? 'card__due--overdue' : ''}`}>{due}</span>
        )}
        {speakOn && (
          <button className="card__speak" onClick={speakThis} title="Read aloud" aria-label="Read aloud">🔊</button>
        )}
      </header>

      <div className="card__body">
        <CategoryBody reminder={reminder} />
      </div>

      {reminder.notes && <p className="card__notes">{reminder.notes}</p>}

      <AttachmentStrip reminderId={reminder.id} />

      <footer className="card__actions">
        <CategoryActions reminder={reminder} busy={busy} run={run} />
        {!isDone && (
          <>
            <button className="card__btn card__btn--ghost" disabled={busy} onClick={() => run('snooze', { minutes: 60 })}>
              Snooze 1h
            </button>
            <button className="card__btn card__btn--ghost" disabled={busy} onClick={() => run('done')}>
              Mark done
            </button>
          </>
        )}
        <button className="card__btn card__btn--text" disabled={busy} onClick={() => run('delete')}>
          Remove
        </button>
      </footer>
    </article>
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function AttachmentStrip({ reminderId }) {
  const [attachments, setAttachments] = useState([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    listAttachments(reminderId).then(setAttachments);
  }, [reminderId]);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      await addAttachment(reminderId, file);
      setAttachments(await listAttachments(reminderId));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="attachments">
      <div className="attachments__strip">
        {attachments.map((a) => (
          <img key={a.id} src={a.data_url} alt={a.label} className="attachments__thumb" />
        ))}
        <button
          className="attachments__add"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          title="Attach a photo — receipt, prescription, etc."
        >
          📎
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={handleFile}
        />
      </div>
    </div>
  );
}

function CategoryBody({ reminder }) {
  const d = reminder.details || {};
  switch (reminder.category) {
    case 'DEBT': {
      const pct = Math.max(0, Math.min(100, 100 - (Number(d.balance) / Number(d.amount)) * 100));
      return (
        <div className="debt-block">
          <div className="debt-block__row">
            <span>{d.counterparty}</span>
            <strong>{formatMoney(d.balance, d.currency)} remaining</strong>
          </div>
          <div className="progress"><div className="progress__fill" style={{ width: `${pct}%` }} /></div>
          <div className="debt-block__row debt-block__row--sub">
            <span>of {formatMoney(d.amount, d.currency)}</span>
            {d.interest_rate && <span>{d.interest_rate}% interest</span>}
          </div>
        </div>
      );
    }
    case 'MEDICINE':
      return (
        <div className="med-block">
          <div className="med-block__dose">{d.dosage} · every {d.frequency_hours}h</div>
          <div className="med-block__row">
            <span>{d.doses_taken} dose(s) logged</span>
            {d.course_duration_days && <span>{d.course_duration_days}-day course</span>}
          </div>
        </div>
      );
    case 'MEETING':
      return (
        <div className="meeting-block">
          {d.location && <div className="meeting-block__row">📍 {d.location}</div>}
          {d.link && <div className="meeting-block__row">🔗 {d.link}</div>}
          <div className="meeting-block__row meeting-block__row--sub">
            {formatDate(reminder.trigger_at)} · alert {d.lead_time_mins}m before
          </div>
        </div>
      );
    case 'IDEA':
      return (
        <div className="idea-block">
          <p className="idea-block__note">{d.note}</p>
          {d.tags && <div className="idea-block__tags">{d.tags}</div>}
        </div>
      );
    default:
      return null;
  }
}

function CategoryActions({ reminder, busy, run }) {
  if (reminder.status === 'DONE') return null;
  switch (reminder.category) {
    case 'DEBT':
      return (
        <button
          className="card__btn"
          disabled={busy}
          onClick={() => {
            const amount = window.prompt('Payment amount received:');
            if (amount) run('payment', { amount: Number(amount) });
          }}
        >
          Log payment
        </button>
      );
    case 'MEDICINE':
      return (
        <button className="card__btn" disabled={busy} onClick={() => run('dose')}>
          Mark dose taken
        </button>
      );
    case 'IDEA':
      return (
        <button className="card__btn" disabled={busy} onClick={() => run('resurface')}>
          Resurface later
        </button>
      );
    default:
      return null;
  }
}
