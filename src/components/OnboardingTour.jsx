import { useState } from 'react';
import { setOnboarded } from '../services/onboardingService';
import { YoRemindMark } from '../brand/Logo';
import './OnboardingTour.css';

const STEPS = [
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
  {
    title: "You're set",
    body: 'Tap "+ New card" to file your first one. You can always revisit settings, themes, and backups from the gear icon.',
  },
];

export default function OnboardingTour({ onDone }) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;

  async function finish() {
    await setOnboarded();
    onDone();
  }

  const current = STEPS[step];

  return (
    <div className="tour">
      <div className="tour__panel">
        <YoRemindMark size={40} />
        <h2 className="tour__title">{current.title}</h2>
        <p className="tour__body">{current.body}</p>

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
