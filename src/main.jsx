import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initNotificationActions, initSoundChannels, rescheduleAll } from './notifications.js'
import { getTheme, applyTheme } from './services/themeService.js'

// Apply the saved theme before first paint so there's no flash of the
// default theme before switching.
getTheme().then(applyTheme);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Registers the notification quick-action buttons (Done / Snooze 1h) and
// wires up what happens when someone taps one, even if the app was closed.
initNotificationActions();

// Creates the per-category Android notification channels (each with its
// own bundled tone) plus the silent channel, so scheduling can reference them.
initSoundChannels();

// AlarmManager entries (the native ringing alarms) don't survive a phone
// reboot, and can also be lost if the OS ever kills the app aggressively.
// Rebuilding them from what's in Dexie every time the app starts is the
// cheapest way to keep OS-level alarms in sync with app state — each
// call is a harmless no-op for reminders that are already scheduled.
rescheduleAll();

// Registers the offline-caching service worker when running as a plain
// web PWA (installed via Netlify/"Add to Home Screen"). This is what
// makes the app shell itself load with no connection. It has nothing to
// do with the native alarms — those come from Capacitor, see notifications.js.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
