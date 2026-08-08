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
import { CATEGORIES, CATEGORY_ORDER } from './categories';
import { isLockEnabled } from './services/lockService';
import { isOnboarded } from './services/onboardingService';
import { resolveAlarmSound } from './services/notificationPrefs';
import { isNativeAndroid, consumePendingAlarmAction } from './services/nativeAlarm';
import { getPermissionStatus, requestPermission, rescheduleAll, consumeLastScheduleError } from './notifications';
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

  // Notification permission is never requested automatically by Android —
  // only an explicit call to requestPermissions() triggers the OS dialog.
  // Relying on someone finding the small header toggle isn't reliable, so
  // request it proactively once per install: right after the first-time
  // tour for new installs, or on first load for anyone already past it.
  useEffect(() => {
    isOnboarded().then(async (done) => {
      if (!done) return; // the tour's own completion triggers this instead — see below
      const status = await getPermissionStatus();
      if (status === 'prompt' || status === 'prompt-with-rationale') {
        const result = await requestPermission();
        if (result === 'granted') await rescheduleAll();
      }
    });
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
  // On the native Android build, real ringing alarms are handled
  // entirely outside this webview — AlarmManager wakes AlarmReceiver,
  // which rings via AlarmRingService and shows AlarmActivity full-screen,
  // even with the app closed and the screen off (see notifications.js /
  // android/.../AlarmSchedulerPlugin.java). That fires on its own; this
  // in-app watcher would just double-ring the same alarm if it also ran
  // here, so it's skipped entirely on native Android.
  //
  // Everywhere else (installed web PWA), there's no native alarm layer
  // to fall back on — the browser sandbox can't play a custom looping
  // tone or wake the screen from a closed tab. This watcher is the best
  // available substitute: while the app is open (foreground or a
  // background tab), it checks every few seconds for anything now due
  // and raises a full-screen alarm with the sound the reminder is set to use.
  useEffect(() => {
    if (isNativeAndroid()) return;
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

  // Picks up "Done"/"Snooze 1h" taps made on the native full-screen alarm
  // screen (AlarmActivity), which can't touch Dexie directly since that
  // only exists inside this webview. It stashes the intended action and
  // opens the app; this polls for that hand-off and runs it through the
  // same api.js path every other action in this file uses.
  useEffect(() => {
    if (!isNativeAndroid()) return;
    async function checkPendingAlarmAction() {
      const pending = await consumePendingAlarmAction();
      if (!pending) return;
      try {
        if (pending.action === 'done') await api.updateStatus(pending.reminderId, 'DONE');
        else if (pending.action === 'snooze') await api.snooze(pending.reminderId, { minutes: 60 });
        await reload();
      } catch {
        // Reminder may have been deleted since the alarm was scheduled — ignore.
      }
    }
    checkPendingAlarmAction();
    const timer = setInterval(checkPendingAlarmAction, 4000);
    return () => clearInterval(timer);
  }, [reload]);

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

  const overdueCount = useMemo(
    () => reminders.filter((r) => r.effective_status === 'OVERDUE').length,
    [reminders]
  );

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
      const scheduleErr = consumeLastScheduleError();
      if (scheduleErr) flashToast(`⚠️ Couldn't schedule the alarm: ${scheduleErr}`);
      await reload();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleCreate(payload) {
    await api.create(payload);
    const err = consumeLastScheduleError();
    if (err) flashToast(`⚠️ Couldn't schedule the alarm: ${err}`);
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
          <div className="quick-glance" aria-label="Quick glance">
            <button
              className={`quick-glance__chip ${view === 'TODAY' ? 'is-active' : ''}`}
              style={{ '--chip-accent': 'var(--idea)' }}
              onClick={() => setView('TODAY')}
            >
              <span className="quick-glance__value">{counts.TODAY}</span>
              <span className="quick-glance__label">Today</span>
            </button>

            {overdueCount > 0 && (
              <button
                className={`quick-glance__chip ${view === 'TODAY' ? 'is-active' : ''}`}
                style={{ '--chip-accent': 'var(--danger)' }}
                onClick={() => setView('TODAY')}
              >
                <span className="quick-glance__value quick-glance__value--danger">{overdueCount}</span>
                <span className="quick-glance__label">Overdue</span>
              </button>
            )}

            {CATEGORY_ORDER.map((key) => {
              const cat = CATEGORIES[key];
              return (
                <button
                  key={key}
                  className={`quick-glance__chip ${view === key ? 'is-active' : ''}`}
                  style={{ '--chip-accent': cat.accent }}
                  onClick={() => setView(key)}
                >
                  <span className="quick-glance__value">{counts[key]}</span>
                  <span className="quick-glance__label">{cat.label}</span>
                </button>
              );
            })}
          </div>
        )}

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

      {showTour && (
        <OnboardingTour
          onDone={async () => {
            setShowTour(false);
            // This is the moment we've just explained *why* alerts matter —
            // asking right here, instead of leaving it to a header button
            // someone has to notice on their own, is what actually gets
            // permission granted in practice.
            const result = await requestPermission();
            if (result === 'granted') await rescheduleAll();
          }}
        />
      )}

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
