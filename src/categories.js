// Single source of truth for how each category presents itself:
// its guide-tab letter, accent color, and human label.
export const CATEGORIES = {
  DEBT: { label: 'Debts & loans', tab: 'D', accent: 'var(--debt)', soft: 'var(--debt-soft)' },
  MEDICINE: { label: 'Medicine', tab: 'M', accent: 'var(--medicine)', soft: 'var(--medicine-soft)' },
  MEETING: { label: 'Meetings', tab: 'G', accent: 'var(--meeting)', soft: 'var(--meeting-soft)' },
  IDEA: { label: 'Ideas', tab: 'I', accent: 'var(--idea)', soft: 'var(--idea-soft)' },
};

export const CATEGORY_ORDER = ['DEBT', 'MEDICINE', 'MEETING', 'IDEA'];

export function formatMoney(amount, currency = 'UGX') {
  const n = Number(amount);
  return `${currency} ${n.toLocaleString('en-UG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function relativeDue(iso) {
  if (!iso) return null;
  const diffMs = new Date(iso).getTime() - Date.now();
  const diffH = diffMs / 3600000;
  if (diffH < 0) {
    const overdueH = Math.abs(diffH);
    if (overdueH < 24) return `overdue by ${Math.round(overdueH)}h`;
    return `overdue by ${Math.round(overdueH / 24)}d`;
  }
  if (diffH < 1) return `due in ${Math.round(diffH * 60)}m`;
  if (diffH < 24) return `due in ${Math.round(diffH)}h`;
  return `due in ${Math.round(diffH / 24)}d`;
}
