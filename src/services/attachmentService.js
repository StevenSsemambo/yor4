import { db, uuid, nowIso } from '../db/db';

const MAX_DIMENSION = 1280; // downscale so receipts/prescriptions don't bloat IndexedDB

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function downscale(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
        resolve(dataUrl);
        return;
      }
      const scale = MAX_DIMENSION / Math.max(width, height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => resolve(dataUrl); // fall back to original if decoding fails
    img.src = dataUrl;
  });
}

/** file comes straight from an <input type="file" accept="image/*" capture> —
 *  that HTML attribute alone opens the phone's native camera/gallery picker,
 *  no Capacitor camera plugin required. */
export async function addAttachment(reminderId, file) {
  const raw = await readAsDataUrl(file);
  const dataUrl = await downscale(raw);
  const record = { id: uuid(), reminder_id: reminderId, data_url: dataUrl, added_at: nowIso(), label: file.name || 'photo' };
  await db.attachments.add(record);
  return record;
}

export async function listAttachments(reminderId) {
  const rows = await db.attachments.where('reminder_id').equals(reminderId).toArray();
  return rows.sort((a, b) => new Date(b.added_at) - new Date(a.added_at));
}

export async function deleteAttachment(id) {
  await db.attachments.delete(id);
}

export async function deleteAttachmentsForReminder(reminderId) {
  const rows = await db.attachments.where('reminder_id').equals(reminderId).toArray();
  await db.attachments.bulkDelete(rows.map((r) => r.id));
}
