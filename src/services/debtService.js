import { db, uuid, nowIso } from '../db/db';
import { ApiError } from './ApiError';
import { logHistory } from './reminderService';

export async function createDebtReminder(body) {
  const { title, priority = 'MEDIUM', notes, amount, currency = 'UGX', counterparty, interestRate, triggerAt, alarmSound = 'default' } = body;

  if (!title || amount == null || !counterparty) {
    throw new ApiError(400, 'title, amount, and counterparty are required for a debt reminder');
  }

  return db.transaction('rw', db.reminders, db.debtDetails, db.historyLogs, async () => {
    const reminderId = uuid();
    const reminder = {
      id: reminderId,
      title,
      category: 'DEBT',
      status: 'PENDING',
      priority,
      trigger_type: 'ONE_TIME',
      trigger_at: triggerAt || null,
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
      amount: Number(amount),
      currency,
      counterparty,
      interest_rate: interestRate != null ? Number(interestRate) : null,
      balance: Number(amount),
    };
    await db.debtDetails.add(detail);

    await logHistory(reminderId, 'created', `${currency} ${amount} owed to/by ${counterparty}`);
    return { ...reminder, details: detail };
  });
}

export async function logPayment(reminderId, { amount, note } = {}) {
  if (!amount || Number(amount) <= 0) {
    throw new ApiError(400, 'amount must be a positive number');
  }

  return db.transaction('rw', db.debtDetails, db.payments, db.reminders, db.historyLogs, async () => {
    const debt = await db.debtDetails.where('reminder_id').equals(reminderId).first();
    if (!debt) throw new ApiError(404, 'Debt reminder not found');

    const payment = { id: uuid(), debt_id: debt.id, amount: Number(amount), paid_at: nowIso(), note: note || null };
    await db.payments.add(payment);

    const newBalance = Math.max(0, Number(debt.balance) - Number(amount));
    const updatedDetail = { ...debt, balance: newBalance };
    await db.debtDetails.put(updatedDetail);

    let updatedReminder = await db.reminders.get(reminderId);
    if (newBalance <= 0) {
      updatedReminder = { ...updatedReminder, status: 'DONE', updated_at: nowIso() };
      await db.reminders.put(updatedReminder);
    }

    await logHistory(
      reminderId,
      'payment_logged',
      newBalance <= 0 ? `final payment of ${amount}, debt cleared` : `paid ${amount}, balance now ${newBalance}`
    );

    return { ...updatedReminder, details: updatedDetail, payment };
  });
}

export async function listPayments(reminderId) {
  const debt = await db.debtDetails.where('reminder_id').equals(reminderId).first();
  if (!debt) throw new ApiError(404, 'Debt reminder not found');
  const rows = await db.payments.where('debt_id').equals(debt.id).toArray();
  return rows.sort((a, b) => new Date(b.paid_at) - new Date(a.paid_at));
}

export async function debtSummary() {
  const debts = await db.debtDetails.toArray();
  const totalOwed = debts.reduce((sum, d) => sum + Number(d.balance), 0);
  return { openDebts: debts.filter((d) => Number(d.balance) > 0).length, totalOutstanding: totalOwed };
}
