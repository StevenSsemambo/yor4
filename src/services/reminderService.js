import { db, uuid, nowIso } from '../db/db';
import { ApiError } from './ApiError';
import { withEffectiveStatus } from './statusHelper';

export const detailTable = {
  DEBT: 'debtDetails',
  MEDICINE: 'medicineDetails',
  MEETING: 'meetingDetails',
  IDEA: 'ideaDetails',
};

export async function logHistory(reminderId, action, detail = null) {
  await db.historyLogs.add({
    id: uuid(),
    reminder_id: reminderId,
    action,
    detail,
    created_at: nowIso(),
  });
}

async function getReminderCore(id) {
  return (await db.reminders.get(id)) || null;
}

export async function attachDetails(reminder) {
  if (!reminder) return null;
  const table = detailTable[reminder.category];
  const details = await db[table].where('reminder_id').equals(reminder.id).first();
  return withEffectiveStatus({ ...reminder, details: details || null });
}

export async function listReminders({ category, status, q } = {}) {
  let collection = db.reminders.toCollection();
  const all = await collection.toArray();

  let rows = all;
  if (category) rows = rows.filter((r) => r.category === category.toUpperCase());
  if (status) rows = rows.filter((r) => r.status === status.toUpperCase());
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((r) => r.title.toLowerCase().includes(needle) || (r.notes || '').toLowerCase().includes(needle));
  }

  rows.sort((a, b) => {
    if (!a.trigger_at && !b.trigger_at) return new Date(b.created_at) - new Date(a.created_at);
    if (!a.trigger_at) return 1;
    if (!b.trigger_at) return -1;
    return new Date(a.trigger_at) - new Date(b.trigger_at);
  });

  return Promise.all(rows.map(attachDetails));
}

export async function listToday() {
  const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const all = await db.reminders.toArray();
  const rows = all
    .filter((r) => r.status !== 'DONE' && (!r.trigger_at || new Date(r.trigger_at) <= cutoff))
    .sort((a, b) => {
      if (!a.trigger_at) return 1;
      if (!b.trigger_at) return -1;
      return new Date(a.trigger_at) - new Date(b.trigger_at);
    });
  return Promise.all(rows.map(attachDetails));
}

export async function getReminder(id) {
  const core = await getReminderCore(id);
  if (!core) throw new ApiError(404, 'Reminder not found');
  return attachDetails(core);
}

export async function getHistory(id) {
  await getReminder(id); // 404 if missing
  const rows = await db.historyLogs.where('reminder_id').equals(id).toArray();
  return rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export async function updateStatus(id, status) {
  const allowed = ['PENDING', 'DONE', 'SNOOZED', 'MISSED'];
  if (!allowed.includes(status)) {
    throw new ApiError(400, `status must be one of ${allowed.join(', ')}`);
  }
  return db.transaction('rw', db.reminders, db.historyLogs, db.debtDetails, db.medicineDetails, db.meetingDetails, db.ideaDetails, async () => {
    const existing = await db.reminders.get(id);
    if (!existing) throw new ApiError(404, 'Reminder not found');
    const updated = { ...existing, status, updated_at: nowIso() };
    await db.reminders.put(updated);
    await logHistory(id, 'status_changed', status);
    return attachDetails(updated);
  });
}

export async function snooze(id, { minutes, until }) {
  if (!minutes && !until) {
    throw new ApiError(400, 'Provide either "minutes" or "until" (ISO datetime)');
  }
  return db.transaction('rw', db.reminders, db.historyLogs, db.debtDetails, db.medicineDetails, db.meetingDetails, db.ideaDetails, async () => {
    const existing = await db.reminders.get(id);
    if (!existing) throw new ApiError(404, 'Reminder not found');
    const newTriggerAt = until
      ? new Date(until).toISOString()
      : new Date(Date.now() + Number(minutes) * 60000).toISOString();
    const updated = { ...existing, trigger_at: newTriggerAt, status: 'SNOOZED', updated_at: nowIso() };
    await db.reminders.put(updated);
    await logHistory(id, 'snoozed', `new trigger_at: ${newTriggerAt}`);
    return attachDetails(updated);
  });
}

export async function deleteReminder(id) {
  const existing = await db.reminders.get(id);
  if (!existing) throw new ApiError(404, 'Reminder not found');
  const table = detailTable[existing.category];
  await db.transaction('rw', db.reminders, db.historyLogs, db.notifSchedule, db.attachments, db.payments, db.doseLogs, db[table], async () => {
    const detail = await db[table].where('reminder_id').equals(id).first();
    if (detail) {
      await db[table].delete(detail.id);
      if (table === 'debtDetails') {
        const pays = await db.payments.where('debt_id').equals(detail.id).toArray();
        await db.payments.bulkDelete(pays.map((p) => p.id));
      }
      if (table === 'medicineDetails') {
        const doses = await db.doseLogs.where('medicine_id').equals(detail.id).toArray();
        await db.doseLogs.bulkDelete(doses.map((d) => d.id));
      }
    }
    const hist = await db.historyLogs.where('reminder_id').equals(id).toArray();
    await db.historyLogs.bulkDelete(hist.map((h) => h.id));
    const atts = await db.attachments.where('reminder_id').equals(id).toArray();
    await db.attachments.bulkDelete(atts.map((a) => a.id));
    await db.notifSchedule.delete(id);
    await db.reminders.delete(id);
  });
}
