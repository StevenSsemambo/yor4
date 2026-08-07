import { useMemo, useState } from 'react';
import ReminderCard from './ReminderCard';
import { CATEGORIES } from '../categories';
import './CalendarView.css';

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

export default function CalendarView({ reminders, onAction }) {
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(null);

  const byDay = useMemo(() => {
    const map = {};
    reminders.forEach((r) => {
      if (!r.trigger_at) return;
      const key = ymd(new Date(r.trigger_at));
      (map[key] ||= []).push(r);
    });
    return map;
  }, [reminders]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = ymd(new Date());

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const selectedItems = selectedDay ? (byDay[selectedDay] || []) : [];

  return (
    <div className="calendar">
      <div className="calendar__head">
        <button className="card__btn card__btn--ghost" onClick={() => setCursor(new Date(year, month - 1, 1))}>‹</button>
        <div className="calendar__month">{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
        <button className="card__btn card__btn--ghost" onClick={() => setCursor(new Date(year, month + 1, 1))}>›</button>
      </div>

      <div className="calendar__weekdays">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i}>{d}</div>)}
      </div>

      <div className="calendar__grid">
        {cells.map((date, i) => {
          if (!date) return <div key={i} className="calendar__cell calendar__cell--empty" />;
          const key = ymd(date);
          const items = byDay[key] || [];
          const isToday = key === todayKey;
          const isSelected = key === selectedDay;
          return (
            <button
              key={i}
              className={`calendar__cell ${isToday ? 'calendar__cell--today' : ''} ${isSelected ? 'calendar__cell--selected' : ''}`}
              onClick={() => setSelectedDay(isSelected ? null : key)}
            >
              <span className="calendar__daynum">{date.getDate()}</span>
              <span className="calendar__dots">
                {items.slice(0, 4).map((r, idx) => (
                  <span key={idx} className="calendar__dot" style={{ background: CATEGORIES[r.category]?.accent }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <div className="calendar__daypanel">
          <h3 className="calendar__daytitle">
            {new Date(selectedDay).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </h3>
          {selectedItems.length === 0 ? (
            <p className="calendar__empty">Nothing due this day.</p>
          ) : (
            <div className="cards">
              {selectedItems.map((r) => <ReminderCard key={r.id} reminder={r} onAction={onAction} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
