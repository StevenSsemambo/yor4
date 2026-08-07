import { db } from '../db/db';

async function hash(pin) {
  const enc = new TextEncoder().encode(`yoremind:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function isLockEnabled() {
  const row = await db.meta.get('pinHash');
  return !!row?.value;
}

export async function setPin(pin) {
  const h = await hash(pin);
  await db.meta.put({ key: 'pinHash', value: h });
}

export async function verifyPin(pin) {
  const row = await db.meta.get('pinHash');
  if (!row?.value) return true; // no lock set — nothing to verify against
  const h = await hash(pin);
  return h === row.value;
}

export async function clearPin() {
  await db.meta.delete('pinHash');
}
