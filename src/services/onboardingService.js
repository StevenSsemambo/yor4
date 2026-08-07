import { db } from '../db/db';

export async function isOnboarded() {
  const row = await db.meta.get('onboarded');
  return !!row?.value;
}

export async function setOnboarded() {
  await db.meta.put({ key: 'onboarded', value: true });
}
