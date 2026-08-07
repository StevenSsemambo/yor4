import { db, uuid, nowIso } from '../db/db';
import { ApiError } from './ApiError';
import { logHistory } from './reminderService';

export async function createMeetingReminder(body) {
  const { title, priority = 'MEDIUM', notes, triggerAt, location, link, attendees, durationMins, leadTimeMins = 15, alarmSound = 'default' } = body;

  if (!title || !triggerAt) {
    throw new ApiError(400, 'title and triggerAt are required for a meeting reminder');
  }

  return db.transaction('rw', db.reminders, db.meetingDetails, db.historyLogs, async () => {
    const reminderId = uuid();
    const reminder = {
      id: reminderId,
      title,
      category: 'MEETING',
      status: 'PENDING',
      priority,
      trigger_type: 'ONE_TIME',
      trigger_at: triggerAt,
      recurrence_rule: null,
      notes: notes || null,
      alarm_sound: alarmSound,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    await db.reminders.add(reminder);

    const detail = {
      id: uuid(),
      reminder_id: reminderId,
      location: location || null,
      link: link || null,
      attendees: attendees || null,
      duration_mins: durationMins ? Number(durationMins) : null,
      lead_time_mins: Number(leadTimeMins),
    };
    await db.meetingDetails.add(detail);

    await logHistory(reminderId, 'created', `meeting at ${triggerAt}`);
    return { ...reminder, details: detail };
  });
}

/** Both alert timestamps a client would schedule local notifications for. */
export function computeAlertTimes(reminder) {
  const meetingAt = new Date(reminder.trigger_at);
  const leadTimeMins = reminder.details?.lead_time_mins ?? 15;
  const leadAlertAt = new Date(meetingAt.getTime() - leadTimeMins * 60000);
  return {
    leadAlertAt: leadAlertAt.toISOString(),
    atTimeAlertAt: meetingAt.toISOString(),
  };
}
