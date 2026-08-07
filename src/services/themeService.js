import { db } from '../db/db';

export const THEMES = [
  { id: 'wood', label: 'Card Catalog (default)' },
  { id: 'dark', label: 'Reading Room (dark)' },
  { id: 'minimal', label: 'Minimal' },
];

export async function getTheme() {
  const row = await db.meta.get('theme');
  return row?.value || 'wood';
}

export async function setTheme(themeId) {
  await db.meta.put({ key: 'theme', value: themeId });
  applyTheme(themeId);
}

export function applyTheme(themeId) {
  if (themeId === 'wood') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', themeId);
  }
}
