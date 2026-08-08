import { useState } from 'react';
import { setOnboarded } from '../services/onboardingService';
import { requestPermission } from '../notifications';
import {
  isNativeAndroid,
  isIgnoringBatteryOptimizations,
  requestIgnoreBatteryOptimizations,
  checkFullScreenIntentAllowed,
  openFullScreenIntentSettings,
} from '../services/nativeAlarm';
import { YoRemindMark } from '../brand/Logo';
import './OnboardingTour.css';

const INTRO_STEPS = [
  {
    title: 'Welcome to your drawer',
    body: "YoRemind organizes reminders like a library card catalog — each category gets its own drawer, and every reminder is a card filed inside it.",
  },
  {
    title: 'Four kinds of cards',
    body: 'Debts track a running balance. Medicine tracks doses and refills. Meetings alert you twice — a heads-up, then start time. Ideas resurface themselves later so nothing gets buried.',
  },
  {
    title: 'Real alarms, fully offline',
    body: "Every reminder fires as an actual phone alarm, even if the app is closed. Nothing here needs an internet connection — all your data stays on this device.",
  },
];

const FINAL_STEP = {
  title: "You're set",
  body: 'Tap "+ New card" to file your first one. You can always revisit settings, themes, and backups from the gear icon.',
};

// Shown only on native Android, right before the final step — this is
// the app's one shot at getting these prompts in front of someone
// without them having to go dig through Settings themselves. Skipping
// this step (or not tapping the button) still lets them finish
// onboarding; Settings always has the same controls as a fallback.
const PERMISSIONS_STEP = {
  title: 'Make sure alarms can wake your phone',
  body: "Android aggressively kills background apps by default on a lot of phones (Tecno/Infinix, Samsung, Xiaomi especially). Allowing notifications and letting YoRemind ignore battery optimization is what keeps alarms ringing even when the app's been closed for a while.",
};

export default function OnboardingTour({ onDone }) {
  const nativeAndroid = isNativeAndroid();
  const STEPS = nativeAndroid
    ? [...INTRO_STEPS, PERMISSIONS_STEP, FINAL_STEP]
    : [...INTRO_STEPS, FINAL_STEP];
  const permissionsStepIndex = nativeAndroid ? INTRO_STEPS.length : -1;

  const [step, setStep] = useState(0);
  const [requesting, setRequesting] = useState(false);
  const [batteryOk, setBatteryOk] = useState(null);
  const isLast = step === STEPS.length - 1;
  const onPermissionsStep = step === permissionsStepIndex;

  async function finish() {
    await setOnboarded();
    onDone();
  }

  async function handleEnableAlarms() {
    setRequesting(true);
    try {
      await requestPermission(); // notification permission prompt
      await requestIgnoreBatteryOptimizations(); // system "ignore battery optimization" dialog
      const [ignoring, fullScreenAllowed] = await Promise.all([
        isIgnoringBatteryOptimizations(),
        checkFullScreenIntentAllowed(),
      ]);
      setBatteryOk(ignoring);
      if (!fullScreenAllowed) await openFullScreenIntentSettings();
    } finally {
      setRequesting(false);
    }
  }

  const current = STEPS[step];

  return (
    <div className="tour">
      <div className="tour__panel">
        <YoRemindMark size={40} />
        <h2 className="tour__title">{current.title}</h2>
        <p className="tour__body">{current.body}</p>

        {onPermissionsStep && (
          <div className="tour__actions" style={{ marginBottom: '0.75rem' }}>
            <button className="card__btn" type="button" onClick={handleEnableAlarms} disabled={requesting}>
              {requesting ? 'Requesting…' : 'Allow notifications & battery exemption'}
            </button>
            {batteryOk === true && <p className="tour__body">Done — alarms should ring reliably now.</p>}
            {batteryOk === false && (
              <p className="tour__body">
                Battery optimization is still on for YoRemind. You can turn it off any time from Settings → the
                gear icon.
              </p>
            )}
          </div>
        )}

        <div className="tour__dots">
          {STEPS.map((_, i) => (
            <span key={i} className={`tour__dot ${i === step ? 'tour__dot--active' : ''}`} />
          ))}
        </div>

        <div className="tour__actions">
          <button className="card__btn card__btn--text" onClick={finish}>Skip</button>
          {isLast ? (
            <button className="card__btn" onClick={finish}>Get started</button>
          ) : (
            <button className="card__btn" onClick={() => setStep((s) => s + 1)}>Next</button>
          )}
        </div>
      </div>
    </div>
  );
}
