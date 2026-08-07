import { db } from '../db/db';

// Real, distinguishable alarm choices — each maps to a generated tone
// pattern in alarmService.js (no audio files needed, so these work
// identically whether the app is running as a plain installed PWA or
// wrapped natively). "Silent" still vibrates so the alert isn't missed.
export const SOUND_OPTIONS = [
  { id: 'classic', label: '🔔 Classic alarm (beep-beep-beep)' },
  { id: 'urgent', label: '🚨 Urgent siren' },
  { id: 'gentle', label: '🎐 Gentle chime' },
  { id: 'digital', label: '⏰ Digital watch beep' },
  { id: 'silent', label: '🔕 Silent (vibrate only)' },
];

// Kept for anything that still asks for a per-category fallback default —
// each category gets its own signature tone out of the box.
export const CATEGORY_DEFAULT_SOUND = { DEBT: 'urgent', MEDICINE: 'classic', MEETING: 'digital', IDEA: 'gentle' };

const DEFAULTS = { DEBT: 'default', MEDICINE: 'default', MEETING: 'default', IDEA: 'default' };

export async function getSoundPrefs() {
  const row = await db.meta.get('soundPrefs');
  return { ...DEFAULTS, ...(row?.value || {}) };
}

export async function setSoundPref(category, choice) {
  const current = await getSoundPrefs();
  const next = { ...current, [category]: choice };
  await db.meta.put({ key: 'soundPrefs', value: next });
  return next;
}

/** Resolves which alarm tone should actually play for a given reminder:
 *  a per-reminder choice (set when the card was created) wins; otherwise
 *  fall back to the category preference; otherwise the category's
 *  signature default. Never returns 'default' — always a real tone id
 *  from SOUND_OPTIONS (or 'silent'). */
export async function resolveAlarmSound(reminder) {
  if (reminder?.alarm_sound && reminder.alarm_sound !== 'default') return reminder.alarm_sound;
  const prefs = await getSoundPrefs();
  const catChoice = prefs[reminder?.category];
  if (catChoice && catChoice !== 'default') return catChoice;
  return CATEGORY_DEFAULT_SOUND[reminder?.category] || 'classic';
}

export async function getSpeakEnabled() {
  const row = await db.meta.get('speakEnabled');
  return !!row?.value;
}

export async function setSpeakEnabled(enabled) {
  await db.meta.put({ key: 'speakEnabled', value: enabled });
}

/** Reads a reminder aloud using the phone's built-in text-to-speech engine
 *  (Web Speech API — on-device, no plugin, no internet). Only works while
 *  the app is open/foreground; a closed-app native alarm can't trigger
 *  speech because nothing in JS is running at the moment it fires. */
export function speak(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel(); // don't stack overlapping utterances
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 0.95;
  window.speechSynthesis.speak(utter);
}
