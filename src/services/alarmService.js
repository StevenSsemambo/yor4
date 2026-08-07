// Generates real, loud, loopable alarm tones with the Web Audio API —
// no .wav/.mp3 assets to ship, no download size, and (unlike the native
// Capacitor channel sounds in notifications.js, which only work inside a
// compiled Android APK) this works the moment the app is open in any
// browser tab or installed PWA, which is how YoRemind is actually being
// tested right now. This is what makes the "quiet popup" problem go away.

let ctx = null;
let activeStopFns = [];
let vibrateTimer = null;

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

const VIBRATE_PATTERNS = {
  classic: [400, 200, 400, 200, 400, 600],
  urgent: [200, 100, 200, 100, 200, 100, 200, 500],
  gentle: [150, 300, 150, 600],
  digital: [80, 80, 80, 80, 80, 400],
  silent: [300, 200, 300, 200, 300, 900],
};

function startVibration(soundId) {
  if (!('vibrate' in navigator)) return;
  const pattern = VIBRATE_PATTERNS[soundId] || VIBRATE_PATTERNS.classic;
  navigator.vibrate(pattern);
  const cycleMs = pattern.reduce((a, b) => a + b, 0);
  vibrateTimer = setInterval(() => navigator.vibrate(pattern), cycleMs);
}

function stopVibration() {
  if (vibrateTimer) clearInterval(vibrateTimer);
  vibrateTimer = null;
  if ('vibrate' in navigator) navigator.vibrate(0);
}

/** One beep: a short envelope-shaped tone so it doesn't click/pop. */
function beep(audioCtx, { freq, start, duration, gain = 0.35, type = 'sine' }) {
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(g);
  g.connect(audioCtx.destination);

  const t0 = audioCtx.currentTime + start;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
  g.gain.linearRampToValueAtTime(0, t0 + duration);

  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/** Each pattern schedules one "cycle" of beeps relative to now, and
 *  reports how long that cycle lasts so the loop can re-schedule the
 *  next one right after — a poor-man's loop without setInterval drift. */
const PATTERNS = {
  classic: (audioCtx) => {
    beep(audioCtx, { freq: 880, start: 0, duration: 0.18 });
    beep(audioCtx, { freq: 880, start: 0.28, duration: 0.18 });
    beep(audioCtx, { freq: 880, start: 0.56, duration: 0.18 });
    return 1.4;
  },
  urgent: (audioCtx) => {
    // Fast alternating high/low — classic siren feel.
    for (let i = 0; i < 6; i++) {
      beep(audioCtx, { freq: i % 2 === 0 ? 1000 : 700, start: i * 0.15, duration: 0.14, gain: 0.4, type: 'square' });
    }
    return 1.1;
  },
  gentle: (audioCtx) => {
    beep(audioCtx, { freq: 660, start: 0, duration: 0.4, gain: 0.22, type: 'sine' });
    beep(audioCtx, { freq: 990, start: 0.42, duration: 0.5, gain: 0.2, type: 'sine' });
    return 1.6;
  },
  digital: (audioCtx) => {
    for (let i = 0; i < 4; i++) {
      beep(audioCtx, { freq: 1500, start: i * 0.18, duration: 0.08, gain: 0.3, type: 'square' });
    }
    return 1.3;
  },
  silent: () => 1.0, // no audio — vibration-only, handled separately
};

/** Plays the chosen alarm tone on a loop until stopAlarm() is called.
 *  Returns nothing; call stopAlarm() to cancel. Safe to call from a
 *  click/tap handler (that user gesture is what unlocks AudioContext
 *  autoplay on mobile browsers). */
export function playAlarm(soundId = 'classic') {
  stopAlarm(); // never stack two alarms
  const audioCtx = getCtx();
  const pattern = PATTERNS[soundId] || PATTERNS.classic;
  let cancelled = false;

  function loop() {
    if (cancelled) return;
    const cycleLen = pattern(audioCtx);
    const timeoutId = setTimeout(loop, cycleLen * 1000);
    activeStopFns.push(() => clearTimeout(timeoutId));
  }
  loop();
  activeStopFns.push(() => { cancelled = true; });

  startVibration(soundId);
}

export function stopAlarm() {
  activeStopFns.forEach((fn) => fn());
  activeStopFns = [];
  stopVibration();
}

/** Quick one-shot preview (used by the sound picker in the "New card"
 *  form and Settings) — plays a single cycle, no loop, no vibration. */
export function previewAlarm(soundId = 'classic') {
  const audioCtx = getCtx();
  const pattern = PATTERNS[soundId] || PATTERNS.classic;
  pattern(audioCtx);
}
