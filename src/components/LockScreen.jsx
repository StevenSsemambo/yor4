import { useState } from 'react';
import { verifyPin } from '../services/lockService';
import { YoRemindMark } from '../brand/Logo';
import './LockScreen.css';

export default function LockScreen({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(false);
    const ok = await verifyPin(pin);
    setBusy(false);
    if (ok) {
      onUnlock();
    } else {
      setError(true);
      setPin('');
    }
  }

  return (
    <div className="lock">
      <form className="lock__panel" onSubmit={submit}>
        <YoRemindMark size={48} />
        <h1 className="lock__title">This drawer is locked</h1>
        <p className="lock__sub">Enter your PIN to open it.</p>
        <input
          className={`lock__input ${error ? 'lock__input--error' : ''}`}
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => { setPin(e.target.value); setError(false); }}
          placeholder="••••"
        />
        {error && <p className="lock__error">That's not the right PIN — try again.</p>}
        <button className="card__btn" type="submit" disabled={busy || !pin}>
          Unlock
        </button>
      </form>
    </div>
  );
}
