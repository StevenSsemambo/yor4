import { db } from '../db/db';

export async function computeStats() {
  const [reminders, debtDetails, payments, medicineDetails, doseLogs, ideaDetails] = await Promise.all([
    db.reminders.toArray(),
    db.debtDetails.toArray(),
    db.payments.toArray(),
    db.medicineDetails.toArray(),
    db.doseLogs.toArray(),
    db.ideaDetails.toArray(),
  ]);

  const doneCount = reminders.filter((r) => r.status === 'DONE').length;
  const activeCount = reminders.filter((r) => r.status !== 'DONE').length;

  // Debts
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalOutstanding = debtDetails.reduce((sum, d) => sum + Number(d.balance), 0);
  const debtsCleared = debtDetails.filter((d) => Number(d.balance) <= 0).length;
  const paidByCurrency = {};
  payments.forEach((p) => {
    const debt = debtDetails.find((d) => d.id === p.debt_id);
    const currency = debt?.currency || 'UGX';
    paidByCurrency[currency] = (paidByCurrency[currency] || 0) + Number(p.amount);
  });

  // Medicine adherence: taken vs (taken + skipped)
  const takenCount = doseLogs.filter((d) => !d.skipped).length;
  const skippedCount = doseLogs.filter((d) => d.skipped).length;
  const totalLogged = takenCount + skippedCount;
  const adherencePct = totalLogged > 0 ? Math.round((takenCount / totalLogged) * 100) : null;

  // Ideas
  const ideasCaptured = ideaDetails.length;
  const ideasResurfaced = ideaDetails.filter((i) => i.last_resurfaced_at).length;

  // Meetings
  const meetingsCompleted = reminders.filter((r) => r.category === 'MEETING' && r.status === 'DONE').length;

  return {
    activeCount,
    doneCount,
    totalPaid,
    totalOutstanding,
    debtsCleared,
    paidByCurrency,
    adherencePct,
    takenCount,
    skippedCount,
    ideasCaptured,
    ideasResurfaced,
    meetingsCompleted,
  };
}
