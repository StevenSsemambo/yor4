import { useEffect, useState } from 'react';
import { computeStats } from '../services/statsService';
import { formatMoney } from '../categories';
import './StatsPanel.css';

export default function StatsPanel() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    computeStats().then(setStats);
  }, []);

  if (!stats) return <div className="main__state">Tallying the drawer…</div>;

  const currencies = Object.keys(stats.paidByCurrency);

  return (
    <div className="stats">
      <div className="stats__grid">
        <StatCard label="Cards completed" value={stats.doneCount} sub={`${stats.activeCount} still active`} />

        {currencies.length > 0 && (
          <StatCard
            label="Total paid off"
            value={currencies.map((c) => formatMoney(stats.paidByCurrency[c], c)).join(' + ')}
            sub={`${stats.debtsCleared} debt(s) fully cleared`}
            accent="var(--debt)"
          />
        )}

        {stats.totalOutstanding > 0 && (
          <StatCard label="Still outstanding" value={formatMoney(stats.totalOutstanding, currencies[0] || 'UGX')} accent="var(--debt)" />
        )}

        {stats.adherencePct !== null && (
          <StatCard
            label="Dose adherence"
            value={`${stats.adherencePct}%`}
            sub={`${stats.takenCount} taken · ${stats.skippedCount} skipped`}
            accent="var(--medicine)"
          />
        )}

        {stats.meetingsCompleted > 0 && (
          <StatCard label="Meetings attended" value={stats.meetingsCompleted} accent="var(--meeting)" />
        )}

        {stats.ideasCaptured > 0 && (
          <StatCard
            label="Ideas captured"
            value={stats.ideasCaptured}
            sub={`${stats.ideasResurfaced} resurfaced at least once`}
            accent="var(--idea)"
          />
        )}
      </div>

      {stats.doneCount === 0 && stats.ideasCaptured === 0 && currencies.length === 0 && (
        <p className="stats__empty">Nothing tallied yet — this fills in as you use the drawer.</p>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="stat-card" style={accent ? { '--accent': accent } : undefined}>
      <div className="stat-card__value">{value}</div>
      <div className="stat-card__label">{label}</div>
      {sub && <div className="stat-card__sub">{sub}</div>}
    </div>
  );
}
