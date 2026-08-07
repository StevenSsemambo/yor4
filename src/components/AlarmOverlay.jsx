import { useEffect } from 'react';
import { CATEGORIES } from '../categories';
import { playAlarm, stopAlarm } from '../services/alarmService';
import './AlarmOverlay.css';

/** Full-screen "an alarm is ringing right now" screen — the actual
 *  attention-grabbing alert for a due reminder while the app is open.
 *  This is what makes reminders sound like alarms instead of a quiet
 *  notification popup: it takes over the screen, loops the chosen tone
 *  and vibration pattern, and stays up until the user acts on it. */
export default function AlarmOverlay({ reminder, soundId, onDone, onSnooze }) {
  useEffect(() => {
    playAlarm(soundId);
    return () => stopAlarm();
  }, [soundId, reminder.id]);

  const cat = CATEGORIES[reminder.category];
  const d = reminder.details || {};

  const detailLine =
    reminder.category === 'DEBT' ? `${d.currency || 'UGX'} ${d.balance} owed to ${d.counterparty}` :
    reminder.category === 'MEDICINE' ? `Time for your dose: ${d.dosage}` :
    reminder.category === 'MEETING' ? (d.location ? `Starting now at ${d.location}` : 'Starting now') :
    reminder.category === 'IDEA' ? (d.note || '').slice(0, 140) :
    'Reminder due';

  function handleStop() {
    stopAlarm();
    onDone();
  }

  function handleSnooze(minutes) {
    stopAlarm();
    onSnooze(minutes);
  }

  return (
    <div className="alarm-overlay" style={{ '--accent': cat?.accent }} role="alertdialog" aria-live="assertive">
      <div className="alarm-overlay__pulse" />
      <div className="alarm-overlay__content">
        <div className="alarm-overlay__tab">{cat?.tab}</div>
        <div className="alarm-overlay__category">{cat?.label}</div>
        <h2 className="alarm-overlay__title">{reminder.title}</h2>
        {detailLine && <p className="alarm-overlay__detail">{detailLine}</p>}

        <div className="alarm-overlay__actions">
          <button className="alarm-overlay__stop" onClick={handleStop}>Done</button>
          <div className="alarm-overlay__snoozes">
            <button onClick={() => handleSnooze(5)}>Snooze 5m</button>
            <button onClick={() => handleSnooze(15)}>Snooze 15m</button>
            <button onClick={() => handleSnooze(60)}>Snooze 1h</button>
          </div>
        </div>
      </div>
    </div>
  );
}
