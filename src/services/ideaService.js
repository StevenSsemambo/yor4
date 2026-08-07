import { db, uuid, nowIso } from '../db/db';
import { ApiError } from './ApiError';
import { logHistory } from './reminderService';

export async function createIdeaReminder(body) {
  const { title, priority = 'LOW', note, tags, resurfaceIntervalDays = 7, alarmSound = 'default' } = body;

  if (!title || !note) {
    throw new ApiError(400, 'title and note are required for an idea reminder');
  }

  return db.transaction('rw', db.reminders, db.ideaDetails, db.historyLogs, async () => {
    const reminderId = uuid();
    const firstResurface = new Date(Date.now() + Number(resurfaceIntervalDays) * 86400000).toISOString();
    const reminder = {
      id: reminderId,
      title,
      category: 'IDEA',
      status: 'PENDING',
      priority,
      trigger_type: 'RECURRING',
      trigger_at: firstResurface,
      recurrence_rule: `every ${resurfaceIntervalDays} days`,
      notes: null,
      alarm_sound: alarmSound,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    await db.reminders.add(reminder);

    const detail = {
      id: uuid(),
      reminder_id: reminderId,
      note,
      tags: tags || null,
      resurface_interval_days: Number(resurfaceIntervalDays),
      last_resurfaced_at: null,
    };
    await db.ideaDetails.add(detail);

    await logHistory(reminderId, 'created', 'idea captured');
    return { ...reminder, details: detail };
  });
}

/** "Swipe to resurface later": push the next resurface date out and reset trigger_at. */
export async function resurfaceLater(reminderId) {
  return db.transaction('rw', db.ideaDetails, db.reminders, db.historyLogs, async () => {
    const idea = await db.ideaDetails.where('reminder_id').equals(reminderId).first();
    if (!idea) throw new ApiError(404, 'Idea reminder not found');

    const nextAt = new Date(Date.now() + Number(idea.resurface_interval_days) * 86400000).toISOString();
    const updatedIdea = { ...idea, last_resurfaced_at: nowIso() };
    await db.ideaDetails.put(updatedIdea);

    const existingReminder = await db.reminders.get(reminderId);
    const updatedReminder = { ...existingReminder, trigger_at: nextAt, status: 'PENDING', updated_at: nowIso() };
    await db.reminders.put(updatedReminder);

    await logHistory(reminderId, 'resurfaced', `next resurface: ${nextAt}`);
    return { ...updatedReminder, details: updatedIdea };
  });
}
