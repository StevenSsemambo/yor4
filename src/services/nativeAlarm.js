import { registerPlugin, Capacitor } from '@capacitor/core';

/**
 * Thin wrapper around the custom AlarmScheduler native plugin
 * (android/.../AlarmSchedulerPlugin.java). This is what actually makes
 * an alarm ring and wake the screen with the app fully closed —
 * @capacitor/local-notifications alone only posts a normal, one-shot
 * notification. Every method here is a safe no-op on web/iOS, since the
 * native plugin only exists in the Android build.
 */
const AlarmScheduler = registerPlugin('AlarmScheduler');

export function isNativeAndroid() {
  return Capacitor.getPlatform() === 'android';
}

/** Schedules one true ringing alarm. `at` is a millisecond timestamp.
 *  Sent as a string, not a raw number — `at` is a 13-digit millisecond
 *  timestamp, which overflows a 32-bit int and gets stored as a Long by
 *  Android's JSON parsing. The native side was reading it strictly as a
 *  Double, which doesn't reliably recognize a Long, so it silently came
 *  through as missing. A string sidesteps the type mismatch entirely.
 *  Returns { ok: true } on success, or { ok: false, error } on failure —
 *  callers should surface `error` somewhere visible (console + a toast),
 *  since a silently-swallowed native error is exactly what made this
 *  kind of bug invisible before. */
export async function scheduleNativeAlarm({ id, at, title, body, soundFile, reminderId, category }) {
  if (!isNativeAndroid()) return { ok: false, error: 'not-native' };
  try {
    await AlarmScheduler.schedule({ id, at: String(at), title, body, soundFile, reminderId, category });
    return { ok: true };
  } catch (err) {
    const message = err?.message || String(err);
    console.error('[nativeAlarm] schedule failed:', message);
    return { ok: false, error: message };
  }
}

export async function cancelNativeAlarm(id) {
  if (!isNativeAndroid()) return;
  try {
    await AlarmScheduler.cancel({ id });
  } catch {
    // Nothing was scheduled under this id — fine.
  }
}

/** Checks for a Done/Snooze action recorded by the native AlarmActivity
 *  screen (see AlarmActivity.java) and clears it once read. Poll this
 *  from the JS layer (App.jsx) so the actual reminder mutation always
 *  goes through the normal api.js functions. */
export async function consumePendingAlarmAction() {
  if (!isNativeAndroid()) return null;
  try {
    const result = await AlarmScheduler.consumePendingAction();
    if (result?.reminderId && result?.action) return result;
    return null;
  } catch {
    return null;
  }
}

/** Android 14+ requires the person to manually allow full-screen alarm
 *  intents in Settings; below that it's granted automatically. */
export async function checkFullScreenIntentAllowed() {
  if (!isNativeAndroid()) return true;
  try {
    const { allowed } = await AlarmScheduler.canUseFullScreenIntent();
    return allowed !== false;
  } catch {
    return true;
  }
}

export async function openFullScreenIntentSettings() {
  if (!isNativeAndroid()) return;
  try {
    await AlarmScheduler.openFullScreenIntentSettings();
  } catch {
    // ignore
  }
}

/** The #1 real-world cause of "alarms don't fire when closed" on budget
 *  Android phones (Tecno/Infinix HiOS, Samsung, Xiaomi) is aggressive
 *  OEM battery management killing the app in the background regardless
 *  of correct AlarmManager scheduling. */
export async function isIgnoringBatteryOptimizations() {
  if (!isNativeAndroid()) return true;
  try {
    const { ignoring } = await AlarmScheduler.isIgnoringBatteryOptimizations();
    return ignoring !== false;
  } catch {
    return true;
  }
}

export async function requestIgnoreBatteryOptimizations() {
  if (!isNativeAndroid()) return;
  try {
    await AlarmScheduler.requestIgnoreBatteryOptimizations();
  } catch {
    // ignore
  }
}
