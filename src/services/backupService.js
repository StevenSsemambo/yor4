import { db } from '../db/db';
import { rescheduleAll } from '../notifications';

const TABLES = [
  'reminders', 'debtDetails', 'payments', 'medicineDetails',
  'doseLogs', 'meetingDetails', 'ideaDetails', 'historyLogs', 'attachments',
];

export async function exportBackup() {
  const data = {};
  for (const table of TABLES) {
    data[table] = await db[table].toArray();
  }
  const payload = {
    app: 'YoRemind',
    exportedAt: new Date().toISOString(),
    version: 1,
    data,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `yoremind-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Replaces everything currently stored with the contents of the backup
 * file. This is a full restore, not a merge — the assumption is "I lost
 * my phone/reset the app and I'm bringing my data back," not "combine
 * two different histories."
 */
export async function importBackup(file) {
  const text = await file.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('That file isn\'t valid JSON — is it a YoRemind backup file?');
  }
  if (!payload?.data || payload.app !== 'YoRemind') {
    throw new Error('This doesn\'t look like a YoRemind backup file.');
  }

  await db.transaction('rw', db.reminders, db.debtDetails, db.payments, db.medicineDetails, db.doseLogs, db.meetingDetails, db.ideaDetails, db.historyLogs, db.attachments, async () => {
    for (const table of TABLES) {
      await db[table].clear();
      const rows = payload.data[table];
      if (Array.isArray(rows) && rows.length) {
        await db[table].bulkAdd(rows);
      }
    }
  });

  // Re-arm native alarms for every restored reminder.
  await rescheduleAll();
}
