import { db, uuid, nowIso } from '../db/db';
import { ApiError } from './ApiError';
import { logHistory } from './reminderService';

export async function createMedicineReminder(body) {
  const { title, priority = 'MEDIUM', notes, dosage, frequencyHours, courseDurationDays, refillThreshold, startAt, alarmSound = 'default' } = body;

  if (!title || !dosage || !frequencyHours) {
    throw new ApiError(400, 'title, dosage, and frequencyHours are required for a medicine reminder');
  }

  return db.transaction('rw', db.reminders, db.medicineDetails, db.historyLogs, async () => {
    const reminderId = uuid();
    const firstDoseAt = startAt || nowIso();
    const reminder = {
      id: reminderId,
      title,
      category: 'MEDICINE',
      status: 'PENDING',
      priority,
      trigger_type: 'RECURRING',
      trigger_at: firstDoseAt,
      recurrence_rule: `every ${frequencyHours} hours`,
      notes: notes || null,
      alarm_sound: alarmSound,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    await db.reminders.add(reminder);

    const detail = {
      id: uuid(),
      reminder_id: reminderId,
      dosage,
      frequency_hours: Number(frequencyHours),
      course_duration_days: courseDurationDays ? Number(courseDurationDays) : null,
      refill_threshold: refillThreshold ? Number(refillThreshold) : null,
      doses_taken: 0,
    };
    await db.medicineDetails.add(detail);

    await logHistory(reminderId, 'created', `${dosage}, every ${frequencyHours}h`);
    return { ...reminder, details: detail };
  });
}

export async function logDose(reminderId, { skipped = false } = {}) {
  return db.transaction('rw', db.medicineDetails, db.doseLogs, db.reminders, db.historyLogs, async () => {
    const med = await db.medicineDetails.where('reminder_id').equals(reminderId).first();
    if (!med) throw new ApiError(404, 'Medicine reminder not found');

    await db.doseLogs.add({ id: uuid(), medicine_id: med.id, taken_at: nowIso(), skipped });

    const dosesTaken = skipped ? med.doses_taken : med.doses_taken + 1;
    const updatedMed = { ...med, doses_taken: dosesTaken };
    await db.medicineDetails.put(updatedMed);

    const nextTriggerAt = new Date(Date.now() + Number(med.frequency_hours) * 3600000).toISOString();
    const existingReminder = await db.reminders.get(reminderId);
    const updatedReminder = { ...existingReminder, trigger_at: nextTriggerAt, status: 'PENDING', updated_at: nowIso() };
    await db.reminders.put(updatedReminder);

    let refillWarning = null;
    if (med.course_duration_days && med.refill_threshold) {
      const totalDoses = Math.floor((med.course_duration_days * 24) / med.frequency_hours);
      const dosesRemaining = totalDoses - dosesTaken;
      if (dosesRemaining <= med.refill_threshold && dosesRemaining > 0) {
        refillWarning = `Low stock: ~${dosesRemaining} dose(s) left in this course`;
      }
    }

    await logHistory(reminderId, skipped ? 'dose_skipped' : 'dose_taken', refillWarning || `dose #${dosesTaken}`);

    return { ...updatedReminder, details: updatedMed, refillWarning };
  });
}

export async function listDoseLogs(reminderId) {
  const med = await db.medicineDetails.where('reminder_id').equals(reminderId).first();
  if (!med) throw new ApiError(404, 'Medicine reminder not found');
  const rows = await db.doseLogs.where('medicine_id').equals(med.id).toArray();
  return rows.sort((a, b) => new Date(b.taken_at) - new Date(a.taken_at));
}
