import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';
import ReminderCard from './components/ReminderCard';
import AddReminderModal from './components/AddReminderModal';
import NotificationToggle from './components/NotificationToggle';
import SettingsPanel from './components/SettingsPanel';
import StatsPanel from './components/StatsPanel';
import CalendarView from './components/CalendarView';
import LockScreen from './components/LockScreen';
import OnboardingTour from './components/OnboardingTour';
import AlarmOverlay from './components/AlarmOverlay';
import { api } from './api';
import { CATEGORIES } from './categories';
import { isLockEnabled } from './services/lockService';
import { isOnboarded } from './services/onboardingService';
import { resolveAlarmSound } from './services/notificationPrefs';
import './App.css';

export default function App() {
  const [checkingLock, setCheckingLock] = useState(true);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    isLockEnabled().then((enabled) => {
      setLocked(enabled);
      setCheckingLock(false);
    });
  }, []);

  if (checkingLock) return null;
  if (locked) return <LockScreen onUnlock={() => setLocked(false)} />;

  return <MainApp />;
}

function matchesQuery(reminder, query) {
  if (!query) return true;
  const needle = query.toLowerCase();
  const haystack = [
    reminder.title,
    reminder.notes,
    reminder.details?.counterparty,
    reminder.details?.dosage,
    reminder.details?.location,
    reminder.details?.note,
    reminder.details?.tags,
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(needle);
}

function MainApp() {
  const [view, setView] = useState('TODAY');
  const [reminders, setReminders] = useState([]);
  const [todayReminders, setTodayReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [search, setSearch] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [toast, setToast] = useState(null);
  const [currentAlarm, setCurrentAlarm] = useState(null); // { reminder, soundId } | null
  const alertedRef = useRef(new Set()); // `${id}:${trigger_at}` already alarmed this session

  useEffect(() => {
    isOnboarded().then((done) => setShowTour(!done));
  }, []);

  function flashToast(text) {
    setToast(text);
    setTimeout(() => setToast(null), 3200);
  }

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [all, today] = await Promise.all([api.list(), api.today()]);
      setReminders(all);
      setTodayReminders(today);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // ── The actual alarm mechanism ────────────────────────────────────
  // Capacitor's native local-notification channels (notifications.js)
  // only fire a real alarm-style sound inside a compiled Android APK.
  // Running as an installed web PWA — which is how this build is being
  // tested — the browser's own Notification API can't play a custom
  // looping tone at all, which is why alerts were landing as a silent
  // popup. This watcher is the fix for that: while the app is open (in
  // the foreground or a background tab), it checks every few seconds
  // for anything now due and raises a full-screen alarm with the sound
  // the reminder was actually set to use.
  useEffect(() => {
    const timer = setInterval(async () => {
      if (currentAlarm) return; // one alarm at a time; rest wait their turn
      const now = Date.now();
      const due = reminders
        .filter((r) => r.status !== 'DONE' && r.trigger_at && new Date(r.trigger_at).getTime() <= now)
        .filter((r) => !alertedRef.current.has(`${r.id}:${r.trigger_at}`))
        .sort((a, b) => new Date(a.trigger_at) - new Date(b.trigger_at));
      if (due.length === 0) return;
      const next = due[0];
      alertedRef.current.add(`${next.id}:${next.trigger_at}`);
      const soundId = await resolveAlarmSound(next);
      setCurrentAlarm({ reminder: next, soundId });
    }, 5000);
    return () => clearInterval(timer);
  }, [reminders, currentAlarm]);

  async function handleAlarmDone() {
    const reminder = currentAlarm?.reminder;
    setCurrentAlarm(null);
    if (!reminder) return;
    await handleAction(reminder, 'done');
  }

  async function handleAlarmSnooze(minutes) {
    const reminder = currentAlarm?.reminder;
    setCurrentAlarm(null);
    if (!reminder) return;
    await handleAction(reminder, 'snooze', { minutes });
  }

  const counts = useMemo(() => {
    const c = { TODAY: todayReminders.length };
    Object.keys(CATEGORIES).forEach((key) => {
      c[key] = reminders.filter((r) => r.category === key && r.status !== 'DONE').length;
    });
    return c;
  }, [reminders, todayReminders]);

  const baseVisible = useMemo(() => {
    if (view === 'TODAY') return todayReminders;
    if (view === 'ALL') return reminders;
    return reminders.filter((r) => r.category === view);
  }, [view, reminders, todayReminders]);

  const visible = useMemo(
    () => baseVisible.filter((r) => matchesQuery(r, search)),
    [baseVisible, search]
  );

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  async function bulkMarkDone() {
    for (const id of selectedIds) {
      try { await api.updateStatus(id, 'DONE'); } catch { /* skip */ }
    }
    exitSelectMode();
    await reload();
  }

  async function bulkDelete() {
    if (!window.confirm(`Remove ${selectedIds.size} card(s)? This can't be undone.`)) return;
    for (const id of selectedIds) {
      try { await api.remove(id); } catch { /* skip */ }
    }
    exitSelectMode();
    await reload();
  }

  async function handleAction(reminder, action, payload) {
    try {
      switch (action) {
        case 'done':
          await api.updateStatus(reminder.id, 'DONE');
          break;
        case 'snooze':
          await api.snooze(reminder.id, payload);
          break;
        case 'delete':
          if (!window.confirm(`Remove "${reminder.title}"? This can't be undone.`)) return;
          await api.remove(reminder.id);
          break;
        case 'payment': {
          const result = await api.logPayment(reminder.id, payload);
          if (result.status === 'DONE') flashToast(`🎉 "${reminder.title}" fully paid off!`);
          break;
        }
        case 'dose': {
          const result = await api.logDose(reminder.id, payload);
          const det = result.details;
          if (det?.course_duration_days) {
            const totalDoses = Math.floor((det.course_duration_days * 24) / det.frequency_hours);
            if (det.doses_taken >= totalDoses) flashToast(`✅ "${reminder.title}" course complete!`);
            else if (result.refillWarning) flashToast(`⚠️ ${result.refillWarning}`);
          } else if (result.refillWarning) {
            flashToast(`⚠️ ${result.refillWarning}`);
          }
          break;
        }
        case 'resurface':
          await api.resurface(reminder.id);
          break;
        default:
          break;
      }
      await reload();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleCreate(payload) {
    await api.create(payload);
    await reload();
  }

  const heading = view === 'TODAY' ? 'Today'
    : view === 'ALL' ? 'All cards'
    : view === 'STATS' ? 'Stats'
    : view === 'CALENDAR' ? 'Calendar'
    : CATEGORIES[view]?.label;

  const showListChrome = view !== 'STATS' && view !== 'CALENDAR';

  return (
    <div className="app">
      <Sidebar active={view} onSelect={setView} counts={counts} onOpenSettings={() => setShowSettings(true)} />

      <main className="main">
        <header className="main__header">
          <div>
            <h1 className="main__heading">{heading}</h1>
            <p className="main__subheading">
              {view === 'TODAY'
                ? "Everything due today or overdue, pulled from every drawer."
                : view === 'STATS'
                ? "What this drawer has actually helped you get done."
                : view === 'CALENDAR'
                ? "Tap a day to see what's filed there."
                : `${visible.length} card${visible.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <div className="main__header-actions">
            <NotificationToggle />
            {showListChrome && (
              <button
                className={`main__select-toggle ${selectMode ? 'is-active' : ''}`}
                onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
              >
                {selectMode ? 'Cancel' : 'Select'}
              </button>
            )}
            {showListChrome && (
              <button className="main__add" onClick={() => setShowAdd(true)}>+ New card</button>
            )}
          </div>
        </header>

        {showListChrome && (
          <input
            className="main__search"
            type="search"
            placeholder="Search titles, notes, counterparties, tags…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}

        {selectMode && (
          <div className="bulk-toolbar">
            <span>{selectedIds.size} selected</span>
            <button className="card__btn" disabled={selectedIds.size === 0} onClick={bulkMarkDone}>Mark done</button>
            <button className="card__btn card__btn--ghost" disabled={selectedIds.size === 0} onClick={bulkDelete}>Delete</button>
          </div>
        )}

        {view === 'STATS' && <StatsPanel />}

        {view === 'CALENDAR' && <CalendarView reminders={reminders} onAction={handleAction} />}

        {showListChrome && (
          <>
            {loading && <div className="main__state">Opening the drawer…</div>}
            {error && (
              <div className="main__state main__state--error">
                Something went wrong reading your local storage. ({error})
              </div>
            )}

            {!loading && !error && visible.length === 0 && (
              <div className="main__empty">
                <p>{search ? 'No cards match that search.' : 'Nothing filed here yet.'}</p>
                {!search && <button className="card__btn" onClick={() => setShowAdd(true)}>File the first card</button>}
              </div>
            )}

            <div className="cards">
              {visible.map((r) => (
                <ReminderCard
                  key={r.id}
                  reminder={r}
                  onAction={handleAction}
                  selectable={selectMode}
                  selected={selectedIds.has(r.id)}
                  onToggleSelect={toggleSelect}
                />
              ))}
            </div>
          </>
        )}
      </main>

      {showAdd && (
        <AddReminderModal onClose={() => setShowAdd(false)} onCreate={handleCreate} />
      )}

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      {showTour && <OnboardingTour onDone={() => setShowTour(false)} />}

      {toast && <div className="toast">{toast}</div>}

      <BottomNav
        active={view}
        onSelect={setView}
        counts={counts}
        onAdd={() => setShowAdd(true)}
        onOpenSettings={() => setShowSettings(true)}
      />

      {currentAlarm && (
        <AlarmOverlay
          reminder={currentAlarm.reminder}
          soundId={currentAlarm.soundId}
          onDone={handleAlarmDone}
          onSnooze={handleAlarmSnooze}
        />
      )}
    </div>
  );
}
