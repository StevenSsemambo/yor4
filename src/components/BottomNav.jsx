import { useState } from 'react';
import MoreSheet from './MoreSheet';
import './BottomNav.css';

/** Real fixed bottom tab bar for phones — the thing that was missing
 *  before (the old mobile layout was just the sidebar squeezed into a
 *  horizontal scrolling strip). Five thumb-reachable targets: Today,
 *  All cards, a raised "+ New" button, Calendar, and More (categories,
 *  Stats, Settings — anything that doesn't fit in the bar itself). */
export default function BottomNav({ active, onSelect, counts, onAdd, onOpenSettings }) {
  const [showMore, setShowMore] = useState(false);

  const isMoreActive = !['TODAY', 'ALL', 'CALENDAR'].includes(active);

  return (
    <>
      <nav className="bottom-nav" aria-label="Main navigation">
        <button
          className={`bottom-nav__item ${active === 'TODAY' ? 'is-active' : ''}`}
          onClick={() => onSelect('TODAY')}
        >
          <span className="bottom-nav__icon">★</span>
          <span className="bottom-nav__label">Today</span>
          {counts.TODAY > 0 && <span className="bottom-nav__badge">{counts.TODAY}</span>}
        </button>

        <button
          className={`bottom-nav__item ${active === 'ALL' ? 'is-active' : ''}`}
          onClick={() => onSelect('ALL')}
        >
          <span className="bottom-nav__icon">≡</span>
          <span className="bottom-nav__label">All</span>
        </button>

        <button className="bottom-nav__fab-wrap" onClick={onAdd} aria-label="New card">
          <span className="bottom-nav__fab">+</span>
        </button>

        <button
          className={`bottom-nav__item ${active === 'CALENDAR' ? 'is-active' : ''}`}
          onClick={() => onSelect('CALENDAR')}
        >
          <span className="bottom-nav__icon">📅</span>
          <span className="bottom-nav__label">Calendar</span>
        </button>

        <button
          className={`bottom-nav__item ${isMoreActive ? 'is-active' : ''}`}
          onClick={() => setShowMore(true)}
        >
          <span className="bottom-nav__icon">☰</span>
          <span className="bottom-nav__label">More</span>
        </button>
      </nav>

      {showMore && (
        <MoreSheet
          active={active}
          counts={counts}
          onSelect={(view) => { onSelect(view); setShowMore(false); }}
          onOpenSettings={() => { onOpenSettings(); setShowMore(false); }}
          onClose={() => setShowMore(false)}
        />
      )}
    </>
  );
}
