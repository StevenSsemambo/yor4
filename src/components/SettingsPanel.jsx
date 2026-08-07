import { useEffect, useRef, useState } from 'react';
import { exportBackup, importBackup } from '../services/backupService';
import { isLockEnabled, setPin, clearPin } from '../services/lockService';
import { THEMES, getTheme, setTheme as saveTheme } from '../services/themeService';
import { getSoundPrefs, setSoundPref, getSpeakEnabled, setSpeakEnabled, SOUND_OPTIONS } from '../services/notificationPrefs';
import { previewAlarm } from '../services/alarmService';
import { rescheduleAll } from '../notifications';
import { CATEGORIES } from '../categories';
import { SayMyTechWordmark } from '../brand/Logo';
import './SettingsPanel.css';

export default function SettingsPanel({ onClose }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [lockOn, setLockOn] = useState(false);
  const [pinDraft, setPinDraft] = useState('');
  const [theme, setThemeState] = useState('wood');
  const [soundPrefs, setSoundPrefsState] = useState({});
  const [speakOn, setSpeakOn] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    isLockEnabled().then(setLockOn);
    getTheme().then(setThemeState);
    getSoundPrefs().then(setSoundPrefsState);
    getSpeakEnabled().then(setSpeakOn);
  }, []);

  async function handleExport() {
    setBusy(true);
    try {
      await exportBackup();
      setMessage({ type: 'ok', text: 'Backup downloaded — keep that file somewhere safe (email it to yourself, Drive, etc.).' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!window.confirm('This replaces everything currently in the app with the backup file. Continue?')) {
      e.target.value = '';
      return;
    }
    setBusy(true);
    try {
      await importBackup(file);
      setMessage({ type: 'ok', text: 'Backup restored. Reload the app to see everything.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  async function handleSetPin() {
    if (pinDraft.length < 4) {
      setMessage({ type: 'error', text: 'Use at least 4 digits.' });
      return;
    }
    await setPin(pinDraft);
    setPinDraft('');
    setLockOn(true);
    setMessage({ type: 'ok', text: 'PIN set — the drawer will ask for it next time it opens.' });
  }

  async function handleClearPin() {
    if (!window.confirm('Remove the PIN lock?')) return;
    await clearPin();
    setLockOn(false);
    setMessage({ type: 'ok', text: 'PIN lock removed.' });
  }

  async function handleThemeChange(id) {
    await saveTheme(id);
    setThemeState(id);
  }

  async function handleSoundChange(category, choice) {
    const next = await setSoundPref(category, choice);
    setSoundPrefsState(next);
    await rescheduleAll(); // re-arm alarms so the new channel takes effect
  }

  async function handleSpeakToggle() {
    const next = !speakOn;
    await setSpeakEnabled(next);
    setSpeakOn(next);
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <header className="settings-panel__head">
          <h2>Settings</h2>
          <button className="settings-panel__close" onClick={onClose} aria-label="Close">×</button>
        </header>

        {message && <div className={`settings-panel__msg settings-panel__msg--${message.type}`}>{message.text}</div>}

        <section className="settings-section">
          <h3>Theme</h3>
          <div className="settings-section__row settings-section__row--wrap">
            {THEMES.map((t) => (
              <button
                key={t.id}
                className={`theme-swatch theme-swatch--${t.id} ${theme === t.id ? 'is-active' : ''}`}
                onClick={() => handleThemeChange(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <h3>Notification sound</h3>
          <p className="settings-section__hint">
            Each category can sound different, or stay silent (vibrate only). Individual cards can
            also override this when you create them. This only affects new alarms — already-scheduled
            ones update automatically.
          </p>
          {Object.keys(CATEGORIES).map((key) => (
            <div className="settings-section__row" key={key}>
              <span className="settings-section__catlabel">{CATEGORIES[key].label}</span>
              <select
                className="settings-section__select"
                value={soundPrefs[key] || 'default'}
                onChange={(e) => handleSoundChange(key, e.target.value)}
              >
                <option value="default">Category default</option>
                {SOUND_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              <button
                type="button"
                className="card__btn card__btn--ghost"
                onClick={() => previewAlarm(soundPrefs[key] === 'default' || !soundPrefs[key] ? 'classic' : soundPrefs[key])}
              >
                ▶
              </button>
            </div>
          ))}
          <p className="settings-section__hint">
            Alarms sound while YoRemind is open (foreground or a background tab) using the tones
            above. For alarms to ring reliably with the app fully closed, the drawer needs to be
            built as the native Android app (already scaffolded under <code>/android</code>) rather
            than the installed web version — the browser sandbox doesn't allow a closed web app to
            play custom sound.
          </p>
        </section>

        <section className="settings-section">
          <h3>Voice</h3>
          <div className="settings-section__row">
            <label className="settings-section__toggle">
              <input type="checkbox" checked={speakOn} onChange={handleSpeakToggle} />
              Let me tap a card to have it read aloud
            </label>
          </div>
          <p className="settings-section__hint">
            Uses your phone's built-in text-to-speech, fully offline. Only works while the app is
            open — a closed-app alarm can't trigger speech, the same way it can't play a custom
            animation.
          </p>
        </section>

        <section className="settings-section">
          <h3>Backup &amp; restore</h3>
          <p className="settings-section__hint">
            Everything lives only on this device. Export a backup file regularly, especially before
            switching phones or reinstalling.
          </p>
          <div className="settings-section__row">
            <button className="card__btn" disabled={busy} onClick={handleExport}>Export backup</button>
            <button className="card__btn card__btn--ghost" disabled={busy} onClick={() => fileInputRef.current?.click()}>
              Import backup
            </button>
            <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={handleImportFile} />
          </div>
        </section>

        <section className="settings-section">
          <h3>Lock this drawer</h3>
          {lockOn ? (
            <div className="settings-section__row">
              <span className="settings-section__status">🔒 PIN lock is on</span>
              <button className="card__btn card__btn--text" onClick={handleClearPin}>Remove PIN</button>
            </div>
          ) : (
            <div className="settings-section__row">
              <input
                className="settings-section__pin-input"
                type="password"
                inputMode="numeric"
                placeholder="Set a 4+ digit PIN"
                value={pinDraft}
                onChange={(e) => setPinDraft(e.target.value)}
              />
              <button className="card__btn" onClick={handleSetPin}>Set PIN</button>
            </div>
          )}
        </section>

        <section className="settings-section settings-section--about">
          <h3>About</h3>
          <div className="settings-about">
            <SayMyTechWordmark size="md" />
            <p>YoRemind — the drawer that remembers.</p>
            <p className="settings-about__credit">Developed by Steven Sema · SayMyTech Developers</p>
          </div>
        </section>
      </div>
    </div>
  );
}
