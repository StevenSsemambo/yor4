import { CATEGORIES, CATEGORY_ORDER } from '../categories';
import './MoreSheet.css';

/** Slide-up sheet that holds everything that doesn't fit in the bottom
 *  bar itself: the category drawers, Stats, and Settings. This is the
 *  "no more section" gap from before — categories had nowhere to live
 *  on mobile at all. */
export default function MoreSheet({ active, counts, onSelect, onOpenSettings, onClose }) {
  return (
    <div className="more-sheet-backdrop" onClick={onClose}>
      <div className="more-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="more-sheet__handle" />
        <div className="more-sheet__title">More</div>

        <div className="more-sheet__section-label">By category</div>
        <div className="more-sheet__grid">
          {CATEGORY_ORDER.map((key) => {
            const cat = CATEGORIES[key];
            return (
              <button
                key={key}
                className={`more-sheet__tile ${active === key ? 'is-active' : ''}`}
                style={{ '--accent': cat.accent }}
                onClick={() => onSelect(key)}
              >
                <span className="more-sheet__tile-tab">{cat.tab}</span>
                <span className="more-sheet__tile-label">{cat.label}</span>
                {counts[key] > 0 && <span className="more-sheet__tile-count">{counts[key]}</span>}
              </button>
            );
          })}
        </div>

        <div className="more-sheet__section-label">More</div>
        <button className={`more-sheet__row ${active === 'STATS' ? 'is-active' : ''}`} onClick={() => onSelect('STATS')}>
          <span>📊</span> Stats
        </button>
        <button className="more-sheet__row" onClick={onOpenSettings}>
          <span>⚙</span> Settings
        </button>

        <button className="more-sheet__close" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
