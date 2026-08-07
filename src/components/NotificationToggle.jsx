import { useEffect, useState } from 'react';
import { getPermissionStatus, requestPermission, rescheduleAll } from '../notifications';
import './NotificationToggle.css';

export default function NotificationToggle() {
  const [status, setStatus] = useState('checking'); // checking | denied | prompt | granted
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPermissionStatus().then(setStatus);
  }, []);

  async function handleClick() {
    if (status === 'granted') return; // nothing to toggle off — revoke from system settings
    setBusy(true);
    try {
      const result = await requestPermission();
      setStatus(result);
      if (result === 'granted') await rescheduleAll();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  const label = {
    checking: 'Notifications…',
    denied: 'Notifications blocked',
    prompt: '🔔 Enable alerts',
    'prompt-with-rationale': '🔔 Enable alerts',
    granted: '🔔 Alerts on',
  }[status];

  return (
    <button
      className={`notif-toggle ${status === 'granted' ? 'notif-toggle--on' : ''}`}
      onClick={handleClick}
      disabled={busy || status === 'checking' || status === 'denied' || status === 'granted'}
      title={status === 'denied' ? 'Notifications are blocked — enable them in your phone/browser settings' : undefined}
    >
      {label}
    </button>
  );
}
