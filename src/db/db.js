import Dexie from 'dexie';

/**
 * All data lives on-device, in IndexedDB, via Dexie.
 * Table shapes intentionally mirror the Postgres schema from Phase 1
 * (reminders + one *_details table per category + history_logs) so the
 * service-layer logic below is a close port, not a rewrite.
 */
export const db = new Dexie('yoremind');

db.version(1).stores({
  reminders: 'id, category, status, trigger_at, priority, created_at',
  debtDetails: 'id, reminder_id',
  payments: 'id, debt_id, paid_at',
  medicineDetails: 'id, reminder_id',
  doseLogs: 'id, medicine_id, taken_at',
  meetingDetails: 'id, reminder_id',
  ideaDetails: 'id, reminder_id',
  historyLogs: 'id, reminder_id, created_at',
  // Tracks which native notification IDs belong to which reminder, so we
  // can cancel-and-reschedule cleanly whenever a reminder changes.
  notifSchedule: 'reminder_id',
  // Single-row table for small counters/settings (e.g. the notification-id counter).
  meta: 'key',
});

// v2: photo attachments (receipts, prescriptions, etc.), one reminder can have many.
db.version(2).stores({
  reminders: 'id, category, status, trigger_at, priority, created_at',
  debtDetails: 'id, reminder_id',
  payments: 'id, debt_id, paid_at',
  medicineDetails: 'id, reminder_id',
  doseLogs: 'id, medicine_id, taken_at',
  meetingDetails: 'id, reminder_id',
  ideaDetails: 'id, reminder_id',
  historyLogs: 'id, reminder_id, created_at',
  notifSchedule: 'reminder_id',
  meta: 'key',
  attachments: 'id, reminder_id, added_at',
});

export function uuid() {
  return crypto.randomUUID();
}

export function nowIso() {
  return new Date().toISOString();
}

/** Returns an ever-increasing integer, persisted in IndexedDB, for use as a
 *  Capacitor local-notification ID (which must be a 32-bit int, not a UUID). */
export async function nextNotifId() {
  return db.transaction('rw', db.meta, async () => {
    const row = await db.meta.get('notifIdCounter');
    const next = (row?.value ?? 0) + 1;
    await db.meta.put({ key: 'notifIdCounter', value: next });
    return next;
  });
}
