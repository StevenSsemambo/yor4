/**
 * A reminder's stored status only changes on explicit user action
 * (done, snoozed, ...). Whether it's currently "overdue" is a function
 * of the current time vs trigger_at, so we compute it on read rather
 * than persist it — same approach as the backend, ported verbatim.
 */
export function withEffectiveStatus(reminder) {
  if (!reminder) return reminder;

  const isTerminal = reminder.status === 'DONE';
  const isPastDue =
    reminder.trigger_at && new Date(reminder.trigger_at) < new Date();

  let effective_status = reminder.status;
  if (!isTerminal && isPastDue && reminder.status === 'PENDING') {
    effective_status = 'OVERDUE';
  }

  return { ...reminder, effective_status };
}
