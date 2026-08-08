import { LocalNotifications } from '@capacitor/local-notifications';
import { db, nextNotifId } from './db/db';
import { computeAlertTimes } from './services/meetingService';
import { listReminders, updateStatus, snooze, getReminder } from './services/reminderService';
import { resolveAlarmSound } from './services/notificationPrefs';
import { isNativeAndroid, scheduleNativeAlarm, cancelNativeAlarm } from './services/nativeAlarm';

const ACTION_TYPE_ID = 'REMINDER_ACTIONS';

// One native Android channel per alarm *style* (not per category) — this
// is what makes the per-reminder sound picker in the "New card" form
// actually take effect once this is built as a real APK, not just in the
// foreground JS alarm. The .wav files here live in
// android/app/src/main/res/raw/ and are the same tones the in-app
// AlarmOverlay generates with Web Audio, so it sounds the same whether
// the app is open or the OS is firing the notification on its own.
const CHANNELS = {
  classic: { id: 'alarm-classic', name: 'Classic alarm', sound: 'alarm_classic.wav' },
  urgent: { id: 'alarm-urgent', name: 'Urgent siren', sound: 'alarm_urgent.wav' },
  gentle: { id: 'alarm-gentle', name: 'Gentle chime', sound: 'alarm_gentle.wav' },
  digital: { id: 'alarm-digital', name: 'Digital beep', sound: 'alarm_digital.wav' },
};
const SILENT_CHANNEL_ID = 'silent-reminders';

/** Category-aware phrasing — same copy the Phase-1 push service used. */
function buildMessage(reminder) {
  const d = reminder.details || {};
  switch (reminder.category) {
    case 'DEBT':
      return { title: `💰 ${reminder.title}`, body: `Payment due — ${d.currency || 'UGX'} ${d.balance} owed to ${d.counterparty}` };
    case 'MEDICINE':
      return { title: `💊 ${reminder.title}`, body: `Time for your dose: ${d.dosage}` };
    case 'MEETING':
      return { title: `📅 ${reminder.title}`, body: d.location ? `Starting soon at ${d.location}` : 'Starting soon' };
    case 'IDEA':
      return { title: `💡 ${reminder.title}`, body: (d.note || '').slice(0, 100) || 'An idea worth revisiting' };
    default:
      return { title: reminder.title, body: 'Reminder due' };
  }
}

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window || true; // Capacitor's native side always supports it
}

export async function getPermissionStatus() {
  try {
    const { display } = await LocalNotifications.checkPermissions();
    return display; // 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale'
  } catch {
    return 'denied';
  }
}

export async function requestPermission() {
  const { display } = await LocalNotifications.requestPermissions();
  return display;
}

/** Creates one Android notification channel per alarm tone (each with
 *  its own bundled .wav) plus a shared silent channel. Channels are what
 *  let two different reminders sound different without opening the app —
 *  and once created, Android remembers them; re-creating is a no-op.
 *  Web/other platforms just skip this silently. */
export async function initSoundChannels() {
  try {
    for (const ch of Object.values(CHANNELS)) {
      await LocalNotifications.createChannel({
        id: ch.id,
        name: ch.name,
        sound: ch.sound,
        importance: 5, // max importance = heads-up + sound, closest thing Android has to "alarm-like"
        visibility: 1,
        vibration: true,
      });
    }
    await LocalNotifications.createChannel({
      id: SILENT_CHANNEL_ID,
      name: 'Silent reminders',
      importance: 3,
      visibility: 1,
      vibration: true,
    });
  } catch {
    // Channels are Android-only; harmless no-op elsewhere.
  }
}

/**
 * Registers the "Done" / "Snooze 1h" quick-action buttons that appear on
 * the notification itself, and wires up what happens when someone taps
 * one — straight to the data layer, no need to open the app to act on a
 * reminder. Call this once at app startup (see main.jsx).
 *
 * Only used on the web/iOS fallback path. On native Android, alarms ring
 * through AlarmActivity instead (android/.../AlarmActivity.java), which
 * has its own native Done/Snooze buttons and reports back via
 * nativeAlarm.js's consumePendingAlarmAction() — see the poller in
 * App.jsx.
 */
export async function initNotificationActions() {
  try {
    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: ACTION_TYPE_ID,
          actions: [
            { id: 'MARK_DONE', title: 'Done' },
            { id: 'SNOOZE_1H', title: 'Snooze 1h' },
          ],
        },
      ],
    });
  } catch {
    // Web fallback / older platforms may not support action types — the
    // notification still shows, it just won't have the quick buttons.
  }

  LocalNotifications.addListener('localNotificationActionPerformed', async (event) => {
    const reminderId = event.notification?.extra?.reminderId;
    if (!reminderId) return;
    try {
      const current = await getReminder(reminderId);
      if (!current || current.status === 'DONE') return;

      if (event.actionId === 'MARK_DONE') {
        const updated = await updateStatus(reminderId, 'DONE');
        await scheduleForReminder(updated);
      } else if (event.actionId === 'SNOOZE_1H') {
        const updated = await snooze(reminderId, { minutes: 60 });
        await scheduleForReminder(updated);
      }
    } catch {
      // Reminder may have been deleted since the notification was scheduled — ignore.
    }
  });
}

/** Cancels whatever is currently scheduled for this reminder (if anything). */
async function cancelForReminder(reminderId) {
  const existing = await db.notifSchedule.get(reminderId);
  if (existing?.ids?.length) {
    if (isNativeAndroid()) {
      for (const id of existing.ids) await cancelNativeAlarm(id);
    } else {
      await LocalNotifications.cancel({ notifications: existing.ids.map((id) => ({ id })) });
    }
  }
  await db.notifSchedule.delete(reminderId);
}

/**
 * Cancels any existing alarms for this reminder and schedules fresh ones
 * based on its current trigger_at (and, for meetings, the lead-time alert
 * too). Call this after every create / snooze / dose-log / resurface /
 * status-change / delete so the OS-level alarms always match app state.
 *
 * On the native Android build, this schedules through AlarmScheduler
 * (nativeAlarm.js) — a true AlarmManager.setAlarmClock() alarm that
 * rings and wakes the screen even with the app fully closed. Everywhere
 * else (web/iOS), it falls back to @capacitor/local-notifications, which
 * only rings reliably while the app is open or backgrounded in a tab.
 */
export async function scheduleForReminder(reminder) {
  await cancelForReminder(reminder.id);

  if (!reminder || reminder.status === 'DONE' || !reminder.trigger_at) return;

  const permission = await getPermissionStatus();
  if (permission !== 'granted') return; // nothing to schedule until the user grants permission

  // Per-reminder sound choice (falls back to the category default, falls
  // back to that category's signature tone) resolves to one of the real
  // channels above — this is the piece that makes the sound picker in the
  // "New card" form actually control what plays when the OS fires the
  // alarm, not just what plays inside the open app.
  const soundId = await resolveAlarmSound(reminder);
  const channelId = soundId === 'silent' ? SILENT_CHANNEL_ID : (CHANNELS[soundId]?.id || CHANNELS.classic.id);
  const soundFile = soundId === 'silent' ? null : (CHANNELS[soundId]?.sound || CHANNELS.classic.sound).replace(/\.wav$/, '');

  const entries = []; // { id, at, title, body }
  const now = Date.now();

  if (reminder.category === 'MEETING') {
    const { leadAlertAt, atTimeAlertAt } = computeAlertTimes(reminder);
    const msg = buildMessage(reminder);
    if (new Date(leadAlertAt).getTime() > now) {
      entries.push({
        id: await nextNotifId(),
        at: new Date(leadAlertAt).getTime(),
        title: msg.title,
        body: `Starting in ${reminder.details?.lead_time_mins ?? 15} min — ${msg.body}`,
      });
    }
    if (new Date(atTimeAlertAt).getTime() > now) {
      entries.push({
        id: await nextNotifId(),
        at: new Date(atTimeAlertAt).getTime(),
        title: msg.title,
        body: msg.body,
      });
    }
  } else if (new Date(reminder.trigger_at).getTime() > now) {
    const msg = buildMessage(reminder);
    entries.push({
      id: await nextNotifId(),
      at: new Date(reminder.trigger_at).getTime(),
      title: msg.title,
      body: msg.body,
    });
  }

  if (entries.length === 0) return;

  if (isNativeAndroid()) {
    for (const entry of entries) {
      await scheduleNativeAlarm({
        id: entry.id,
        at: entry.at,
        title: entry.title,
        body: entry.body,
        soundFile: soundFile || 'alarm_classic',
        reminderId: reminder.id,
        category: reminder.category,
      });
    }
  } else {
    const notifications = entries.map((entry) => ({
      id: entry.id,
      title: entry.title,
      body: entry.body,
      schedule: { at: new Date(entry.at) },
      extra: { reminderId: reminder.id },
      actionTypeId: ACTION_TYPE_ID,
      channelId,
    }));
    await LocalNotifications.schedule({ notifications });
  }

  await db.notifSchedule.put({ reminder_id: reminder.id, ids: entries.map((e) => e.id) });
}

export async function cancelAllForReminder(reminderId) {
  await cancelForReminder(reminderId);
}

/** Rebuilds every scheduled alarm from scratch — useful right after the
 *  user grants permission for the first time, or after changing a sound
 *  preference, since only a fresh schedule picks up the new channel. */
export async function rescheduleAll() {
  const all = await listReminders({});
  for (const reminder of all) {
    if (reminder.status !== 'DONE') await scheduleForReminder(reminder);
  }
}
